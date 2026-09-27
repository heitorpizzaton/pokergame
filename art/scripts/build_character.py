"""Builds one roster character as a seated, rigged GLB (AGENTS.md §22-23).

Runs headless in Blender-as-a-module (bpy) with the MPFB2 extension, both installed by
scripts/assets/setup.sh. Usage (normally through `npm run assets:characters`):

    BLENDER_USER_RESOURCES=tools/blender-user tools/venv/bin/python \
        art/scripts/build_character.py --id c01 --out art/build/c01.glb

The output keeps only what the web renderer needs:
- one skinned mesh in a seated bind pose (legs and forearms posed, spine and head neutral, so the
  facial morph targets stay aligned with the head);
- material slots named skin / hair / top / bottom / shoes / eye with the roster colors; the web
  renderer replaces them with its own materials (no textures are shipped for the spike);
- the MPFB "game_engine" skeleton (53 bones, shared by every character);
- morph targets for blinks and a few expressions, from MPFB's CC0 expression units.
"""

import argparse
import json
import math
import os
import sys

import bpy  # noqa: I001 (bpy must be imported before addon_utils)
import addon_utils
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Expression units exported as morph targets (name in the GLB -> MPFB unit file).
EXPRESSIONS = {
    "blinkL": "eye-left-closure",
    "blinkR": "eye-right-closure",
    "smile": "mouth-corner-puller",
    "frown": "mouth-depression",
    "browDownL": "eyebrows-left-down",
    "browDownR": "eyebrows-right-down",
    "browInnerUpL": "eyebrows-left-inner-up",
    "browInnerUpR": "eyebrows-right-inner-up",
    "squintL": "eye-left-slit",
    "squintR": "eye-right-slit",
}

# Which bones' weights decide each clothing region (a face takes the region with the most weight).
REGIONS = {
    "top": ("spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "upperarm_l",
            "upperarm_r"),
    "bottom": ("pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"),
    "shoes": ("foot_l", "foot_r", "ball_l", "ball_r"),
    "skin": ("head", "neck_01", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r"),
}

# Seated bind pose: world-space direction of each bone (character faces -Y, +X is its left).
SEATED = [
    ("thigh_l", (0.12, -1.0, 0.04)),
    ("calf_l", (0.02, 0.12, -1.0)),
    ("foot_l", (0.05, -1.0, -0.35)),
    ("thigh_r", (-0.12, -1.0, 0.04)),
    ("calf_r", (-0.02, 0.12, -1.0)),
    ("foot_r", (-0.05, -1.0, -0.35)),
    ("upperarm_l", (0.22, -0.42, -0.88)),
    ("lowerarm_l", (-0.3, -1.0, 0.04)),
    ("hand_l", (-0.35, -1.0, -0.08)),
    ("upperarm_r", (-0.22, -0.42, -0.88)),
    ("lowerarm_r", (0.3, -1.0, 0.04)),
    ("hand_r", (0.35, -1.0, -0.08)),
]


def enable_mpfb():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    from bl_ext.user_default.mpfb.services.targetservice import TargetService

    return HumanService, TargetService


def mpfb_data(*parts):
    return os.path.join(ROOT, "tools", "mpfb2", "src", "mpfb", "data", *parts)


def race_prefix(race):
    return max(race, key=lambda k: race[k])


def build_body(spec, HumanService, TargetService):
    macros = dict(spec["macros"])
    info = TargetService.get_default_macro_info_dict()
    for key, value in macros.items():
        info[key] = value
    human = HumanService.create_human(macro_detail_dict=info)
    for name, weight in spec.get("targets", {}).items():
        path = mpfb_data("targets", name + ".target.gz")
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        TargetService.load_target(human, path, weight=weight)
    TargetService.bake_targets(human)
    return human


def delete_helpers(human):
    """Keep the body and the eyeballs; drop the other helper geometry (teeth, lashes, cubes)."""
    groups = {g.index: g.name for g in human.vertex_groups}
    keep_helpers = {"helper-l-eye", "helper-r-eye"}
    mesh = human.data
    doomed = []
    for v in mesh.vertices:
        names = {groups[g.group] for g in v.groups if g.weight > 0.0}
        if "body" in names:
            continue
        if names & keep_helpers:
            continue
        doomed.append(v.index)
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in doomed], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    for mod in list(human.modifiers):
        if mod.type == "MASK":
            human.modifiers.remove(mod)


def assign_materials(human, spec):
    mesh = human.data
    names = ["skin", "hair", "top", "bottom", "shoes", "eye"]
    mesh.materials.clear()
    colors = {
        "skin": spec["skin"],
        "hair": spec.get("hair", {}).get("color", spec["skin"]),
        "top": spec["outfit"]["top"],
        "bottom": spec["outfit"]["bottom"],
        "shoes": spec["outfit"]["shoes"],
        "eye": "#f2efe9",
    }
    for name in names:
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = srgb_to_linear(colors[name])
            bsdf.inputs["Roughness"].default_value = 0.6
        mesh.materials.append(mat)
    slot = {n: i for i, n in enumerate(names)}
    groups = {g.name: g.index for g in human.vertex_groups}
    eye_groups = {groups[n] for n in ("helper-l-eye", "helper-r-eye") if n in groups}
    bone_region = {}
    for region, bones in REGIONS.items():
        for b in bones:
            if b in groups:
                bone_region[groups[b]] = region

    head_top = max(v.co.z for v in mesh.vertices)
    hair = spec.get("hair", {}).get("style", "bald") != "bald"

    for poly in mesh.polygons:
        weights = {}
        is_eye = False
        for vi in poly.vertices:
            for g in mesh.vertices[vi].groups:
                if g.group in eye_groups and g.weight > 0.5:
                    is_eye = True
                region = bone_region.get(g.group)
                if region:
                    weights[region] = weights.get(region, 0.0) + g.weight
        if is_eye:
            poly.material_index = slot["eye"]
            continue
        region = max(weights, key=weights.get) if weights else "skin"
        center = poly.center
        if hair and region == "skin" and is_scalp(center, head_top):
            region = "hair"
        poly.material_index = slot[region]


def srgb_to_linear(hex_color):
    def channel(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    h = hex_color.lstrip("#")
    return tuple(channel(int(h[i:i + 2], 16)) for i in (0, 2, 4)) + (1.0,)


def is_scalp(p, head_top):
    """A buzz cut: the top and back of the skull, above the forehead and ears."""
    height = head_top - p.z
    if height > 0.16:
        return False
    # Front hairline: forehead stays skin (the face points to -Y).
    if p.y < -0.02 and height > 0.045:
        return False
    if p.y < -0.075:
        return False
    # Sideburn line: above the ears only.
    if abs(p.x) > 0.06 and height > 0.12:
        return False
    return True


def add_expressions(human, spec, TargetService):
    race = race_prefix(spec["macros"]["race"])
    for key, unit in EXPRESSIONS.items():
        path = mpfb_data("targets", "expression", "units", race, unit + ".target.gz")
        TargetService.load_target(human, path, weight=0.0, name=key)


def aim_bone(rig, name, direction):
    pb = rig.pose.bones[name]
    bpy.context.view_layer.update()
    head = (rig.matrix_world @ pb.matrix).to_translation()
    current = (pb.matrix.to_3x3() @ Vector((0, 1, 0))).normalized()
    target = Vector(direction).normalized()
    rot = current.rotation_difference(target).to_matrix().to_4x4()
    m = pb.matrix.copy()
    m.translation = (0, 0, 0)
    m = rot @ m
    m.translation = head
    pb.matrix = m
    bpy.context.view_layer.update()


def seat(human, rig):
    """Poses legs and arms, then makes that pose the rest pose of both mesh and skeleton."""
    for name, direction in SEATED:
        aim_bone(rig, name, direction)
    bpy.context.view_layer.objects.active = human
    armature_mod = next(m for m in human.modifiers if m.type == "ARMATURE")
    bpy.ops.object.modifier_apply(modifier=armature_mod.name)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    mod = human.modifiers.new("Armature", "ARMATURE")
    mod.object = rig


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else None)

    with open(os.path.join(ROOT, "art", "characters", "roster.json"), encoding="utf-8") as f:
        roster = json.load(f)
    spec = next(c for c in roster["characters"] if c["id"] == args.id)

    HumanService, TargetService = enable_mpfb()
    human = build_body(spec, HumanService, TargetService)
    rig = HumanService.add_builtin_rig(human, "game_engine")
    delete_helpers(human)
    assign_materials(human, spec)
    seat(human, rig)
    add_expressions(human, spec, TargetService)
    human.name = spec["id"]
    rig.name = spec["id"] + "-rig"

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(args.out),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_morph=True,
        export_morph_normal=False,
        export_skins=True,
        export_animations=False,
        export_materials="EXPORT",
        export_yup=True,
    )
    print(f"built {spec['id']}: {len(human.data.vertices)} vertices, "
          f"{len(human.data.polygons)} faces, {len(rig.data.bones)} bones")


if __name__ == "__main__":
    main()
