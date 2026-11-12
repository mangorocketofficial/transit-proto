# Blender로 게임용 스프라이트(건물, 나무, 버스, 열차)를 만들어 PNG로 렌더링한다.
# 실행: blender -b -P tools/make_sprites.py -- <출력 폴더>
# 건물은 흰색 계열로 만들어 두고, 게임에서 구역 색으로 물들인다.
import bpy, bmesh, math, os, sys

OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'sprites')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
try:
    scene.cycles.use_denoising = True
except Exception:
    pass
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'

world = bpy.data.worlds.new('w')
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.95, 0.97, 1.0, 1)
bg.inputs[1].default_value = 0.38
scene.world = world

sun_data = bpy.data.lights.new('sun', 'SUN')
sun_data.energy = 2.6
sun_data.angle = math.radians(8)
sun = bpy.data.objects.new('sun', sun_data)
sun.rotation_euler = (math.radians(38), 0, math.radians(-60))
scene.collection.objects.link(sun)

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

# 그림자만 받는 바닥
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
ground = bpy.context.object
ground.is_shadow_catcher = True

_mats = {}
def mat(rgb, rough=0.8):
    key = (rgb, rough)
    if key not in _mats:
        m = bpy.data.materials.new('m')
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*rgb, 1)
        b.inputs['Roughness'].default_value = rough
        _mats[key] = m
    return _mats[key]

WHITE = (0.88, 0.88, 0.88)
ROOF = (0.55, 0.55, 0.55)
DARK = (0.30, 0.30, 0.30)
GLASS = (0.10, 0.16, 0.24)
made = []

def box(w, d, h, x=0, y=0, z=0, color=WHITE, rot=0, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + h / 2))
    o = bpy.context.object
    o.scale = (w, d, h)
    o.rotation_euler[2] = math.radians(rot)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new('b', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    o.data.materials.append(mat(color))
    made.append(o)
    return o

def gable(w, d, h, x=0, y=0, z=0, color=ROOF, along_x=True):
    # 박공지붕: 삼각기둥
    hw, hd = w / 2, d / 2
    if along_x:
        verts = [(-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0), (-hw, 0, h), (hw, 0, h)]
    else:
        verts = [(-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0), (0, -hd, h), (0, hd, h)]
        faces = [(0, 1, 2, 3), (0, 4, 1), (3, 2, 5), (1, 4, 5, 2), (0, 3, 5, 4)]
    if along_x:
        faces = [(0, 1, 2, 3), (0, 1, 5, 4), (3, 4, 5, 2), (0, 4, 3), (1, 2, 5)]
    me = bpy.data.meshes.new('roof')
    me.from_pydata(verts, [], faces)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('roof', me)
    o.location = (x, y, z)
    scene.collection.objects.link(o)
    o.data.materials.append(mat(color))
    made.append(o)
    return o

def ball(r, x, y, z, color):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z))
    o = bpy.context.object
    o.data.materials.append(mat(color))
    made.append(o)
    return o

def clear():
    for o in made:
        bpy.data.objects.remove(o, do_unlink=True)
    made.clear()

def render(name, tilt, scale, rx, ry, shadow=True):
    t = math.radians(tilt)
    cam.rotation_euler = (t, 0, 0)
    cam.location = (0, -20 * math.sin(t), 20 * math.cos(t))
    cam_data.ortho_scale = scale
    scene.render.resolution_x = rx
    scene.render.resolution_y = ry
    ground.hide_render = not shadow
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    clear()

TILT = 25   # 건물은 살짝 기울여 내려다본다
B = dict(tilt=TILT, scale=6.0, rx=288, ry=288)

# ---------- 주택 ----------
def house(i):
    if i == 0:
        box(1.0, 0.8, 0.55); gable(1.16, 0.96, 0.45, z=0.55)
        box(0.14, 0.14, 0.4, x=0.28, y=0.18, z=0.6, color=DARK)
    elif i == 1:
        box(0.8, 1.0, 0.55); gable(0.96, 1.16, 0.45, z=0.55, along_x=False)
    elif i == 2:
        box(1.1, 0.7, 0.55, y=0.1); gable(1.26, 0.86, 0.42, y=0.1, z=0.55)
        box(0.5, 0.6, 0.5, x=-0.25, y=-0.4); gable(0.62, 0.72, 0.32, x=-0.25, y=-0.4, z=0.5, along_x=False)
    else:
        box(0.9, 0.9, 0.9); gable(1.04, 1.04, 0.4, z=0.9)
        box(0.5, 0.35, 0.06, y=-0.6, color=ROOF)
for i in range(4):
    house(i); render('house%d' % i, **B)

# ---------- 업무 빌딩 ----------
def windows(w, d, h, x=0, y=0, z0=0.25, step=0.36):
    z = z0
    while z < h - 0.2:
        box(w * 0.86, 0.02, 0.16, x=x, y=y - d / 2 - 0.005, z=z, color=GLASS)
        box(0.02, d * 0.86, 0.16, x=x + w / 2 + 0.005, y=y, z=z, color=GLASS)
        z += step

def office(i):
    if i == 0:
        h = 2.2
        box(1.0, 1.0, h); windows(1.0, 1.0, h)
        box(0.9, 0.9, 0.06, z=h, color=ROOF); box(0.3, 0.25, 0.16, x=0.2, y=0.15, z=h + 0.06, color=DARK)
    elif i == 1:
        h = 3.0
        box(0.9, 0.9, h); windows(0.9, 0.9, h)
        box(0.8, 0.8, 0.06, z=h, color=ROOF); box(0.06, 0.06, 0.5, z=h + 0.06, color=DARK)
    elif i == 2:
        box(1.3, 1.0, 1.2); windows(1.3, 1.0, 1.2)
        box(0.8, 0.7, 1.1, x=-0.2, z=1.2); windows(0.8, 0.7, 1.1 + 1.2, x=-0.2, z0=1.45)
        box(0.7, 0.6, 0.06, x=-0.2, z=2.3, color=ROOF)
    else:
        h = 1.6
        box(1.4, 0.8, h); windows(1.4, 0.8, h)
        box(1.3, 0.7, 0.06, z=h, color=ROOF)
        box(0.25, 0.25, 0.14, x=-0.4, z=h + 0.06, color=DARK); box(0.25, 0.25, 0.14, x=0.3, z=h + 0.06, color=DARK)
for i in range(4):
    office(i); render('office%d' % i, **B)

# ---------- 상점 ----------
def shop(i):
    if i == 0:
        box(1.4, 0.9, 0.5); box(1.3, 0.8, 0.05, z=0.5, color=ROOF)
        a = box(1.4, 0.34, 0.04, y=-0.58, z=0.34, color=ROOF); a.rotation_euler[0] = math.radians(-22)
        box(0.5, 0.06, 0.22, y=-0.2, z=0.55, color=DARK)
    elif i == 1:
        box(1.0, 1.0, 0.6); box(0.9, 0.9, 0.05, z=0.6, color=ROOF)
        a = box(1.0, 0.3, 0.04, y=-0.62, z=0.4, color=DARK); a.rotation_euler[0] = math.radians(-22)
        box(0.3, 0.3, 0.14, x=0.2, y=0.2, z=0.65, color=DARK)
    elif i == 2:
        box(1.6, 0.8, 0.45); box(1.5, 0.7, 0.05, z=0.45, color=ROOF)
        for k in range(3):
            a = box(0.42, 0.3, 0.04, x=-0.52 + k * 0.52, y=-0.52, z=0.3, color=(ROOF if k % 2 else WHITE))
            a.rotation_euler[0] = math.radians(-22)
    else:
        box(1.1, 1.1, 0.8); box(1.0, 1.0, 0.05, z=0.8, color=ROOF)
        box(1.14, 0.04, 0.14, y=-0.57, z=0.5, color=GLASS)
        box(0.6, 0.06, 0.3, z=0.85, color=DARK)
for i in range(4):
    shop(i); render('shop%d' % i, **B)

# ---------- 나무 ----------
G1, G2, TRUNK = (0.30, 0.55, 0.26), (0.38, 0.64, 0.30), (0.40, 0.28, 0.18)
box(0.1, 0.1, 0.3, color=TRUNK); ball(0.36, 0, 0, 0.55, G1); ball(0.26, 0.16, -0.1, 0.72, G2)
render('tree0', tilt=TILT, scale=2.4, rx=128, ry=128)
box(0.1, 0.1, 0.25, color=TRUNK); ball(0.30, -0.1, 0, 0.45, G2); ball(0.30, 0.2, 0.08, 0.5, G1); ball(0.22, 0.05, -0.05, 0.75, G2)
render('tree1', tilt=TILT, scale=2.4, rx=128, ry=128)

# ---------- 차량: 바로 위에서 본 모습, 오른쪽이 앞. 흰색 몸체를 게임에서 노선 색으로 물들인다 ----------
def bus():
    box(2.0, 0.9, 0.8, z=0.15, bevel=0.12)
    box(1.5, 0.74, 0.05, x=-0.1, z=0.95, color=ROOF, bevel=0.03)
    box(0.22, 0.78, 0.05, x=0.82, z=0.94, color=GLASS)          # 앞 유리
    box(0.10, 0.70, 0.05, x=-0.93, z=0.94, color=GLASS)         # 뒷 유리
    for sy in (-1, 1):
        box(1.3, 0.05, 0.05, x=-0.12, y=sy * 0.43, z=0.94, color=GLASS)
    box(0.35, 0.3, 0.08, x=-0.4, z=1.0, color=DARK)
bus(); render('bus', tilt=0, scale=2.4, rx=256, ry=128, shadow=False)

def train():
    box(2.2, 0.86, 0.85, z=0.15, bevel=0.1)
    box(1.9, 0.6, 0.05, z=1.0, color=ROOF, bevel=0.03)
    for sx in (-1, 1):
        box(0.14, 0.72, 0.05, x=sx * 0.98, z=0.99, color=GLASS)
    for sy in (-1, 1):
        box(1.7, 0.05, 0.05, y=sy * 0.41, z=0.99, color=GLASS)
    box(0.4, 0.3, 0.08, x=-0.5, z=1.05, color=DARK); box(0.4, 0.3, 0.08, x=0.5, z=1.05, color=DARK)
train(); render('train', tilt=0, scale=2.4, rx=256, ry=128, shadow=False)

print('SPRITES DONE')
