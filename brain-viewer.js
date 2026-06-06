import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CONFIG = {
    t1Url: "models/t1-brain.glb",
    tractographyUrl: "models/tractography.glb",
    tractographyOpacity: 0.7,
};

const container = document.getElementById("brain-viewer");
const canvas = document.getElementById("brain-canvas");
const statusEl = document.getElementById("viewer-status");

const axialSlider = document.getElementById("clip-axial");
const sagittalSlider = document.getElementById("clip-sagittal");
const coronalSlider = document.getElementById("clip-coronal");
const tractSlider = document.getElementById("tract-opacity");

const axialValue = document.getElementById("clip-axial-value");
const sagittalValue = document.getElementById("clip-sagittal-value");
const coronalValue = document.getElementById("clip-coronal-value");
const tractValue = document.getElementById("tract-opacity-value");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x12122e);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 50;
controls.maxDistance = 600;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(2, 3, 4);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xb8c8ff, 0.45);
fillLight.position.set(-3, -1, -2);
scene.add(fillLight);

const brainGroup = new THREE.Group();
const tractGroup = new THREE.Group();
scene.add(brainGroup);
scene.add(tractGroup);

const clipPlanes = {
    axial: new THREE.Plane(new THREE.Vector3(0, -1, 0), Infinity),
    sagittal: new THREE.Plane(new THREE.Vector3(-1, 0, 0), Infinity),
    coronal: new THREE.Plane(new THREE.Vector3(0, 0, -1), Infinity),
};

const allClipPlanes = [clipPlanes.axial, clipPlanes.sagittal, clipPlanes.coronal];
const tractMaterials = [];

let bounds = new THREE.Box3();

function setStatus(message) {
    if (statusEl) {
        statusEl.textContent = message;
    }
}

function isTractographyName(name) {
    return /tract|fiber|dti|streamline/i.test(name);
}

function prepareMesh(mesh, { isTractography }) {
    mesh.traverse((child) => {
        if (!child.isMesh) {
            return;
        }

        const source = child.material;
        const material = Array.isArray(source) ? source.map((m) => m.clone()) : source.clone();
        child.material = material;

        const materials = Array.isArray(material) ? material : [material];
        materials.forEach((mat) => {
            mat.side = THREE.DoubleSide;
            mat.clippingPlanes = allClipPlanes;
            mat.clipShadows = true;

            if (isTractography) {
                mat.transparent = true;
                mat.opacity = CONFIG.tractographyOpacity;
                mat.depthWrite = false;
                tractMaterials.push(mat);
            }
        });
    });
}

function updateBounds() {
    bounds.makeEmpty();
    if (brainGroup.children.length) {
        bounds.expandByObject(brainGroup);
    }
    if (tractGroup.children.length) {
        bounds.expandByObject(tractGroup);
    }
}

function updateClipPlanes() {
    if (bounds.isEmpty()) {
        return;
    }

    const pad = bounds.getSize(new THREE.Vector3()).length() * 0.05;
    const lerp = THREE.MathUtils.lerp;

    // %0 = kesit yok (düzlem modelin dışında), %100 = maksimum kırpma
    const axialT = Number(axialSlider.value) / 100;
    clipPlanes.axial.constant = lerp(bounds.max.y + pad, bounds.min.y, axialT);

    const sagittalT = Number(sagittalSlider.value) / 100;
    clipPlanes.sagittal.constant = lerp(bounds.max.x + pad, bounds.min.x, sagittalT);

    const coronalT = Number(coronalSlider.value) / 100;
    clipPlanes.coronal.constant = lerp(bounds.max.z + pad, bounds.min.z, coronalT);

    axialValue.textContent = `${axialSlider.value}%`;
    sagittalValue.textContent = `${sagittalSlider.value}%`;
    coronalValue.textContent = `${coronalSlider.value}%`;
}

function updateTractOpacity() {
    const opacity = Number(tractSlider.value) / 100;
    tractMaterials.forEach((mat) => {
        mat.opacity = opacity;
    });
    tractValue.textContent = `${tractSlider.value}%`;
}

function frameCamera() {
    if (bounds.isEmpty()) {
        return;
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 1.8;

    camera.position.set(center.x + distance * 0.35, center.y + distance * 0.25, center.z + distance);
    camera.near = maxDim / 200;
    camera.far = maxDim * 20;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
}

function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
}

function loadModel(url) {
    return new Promise((resolve, reject) => {
        new GLTFLoader().load(url, resolve, undefined, reject);
    });
}

function distributeScene(gltf, targetGroup, forceTractography = false) {
    const root = gltf.scene;
    let hasNamedTracts = false;

    root.traverse((child) => {
        if (child.isMesh && isTractographyName(child.name)) {
            hasNamedTracts = true;
        }
    });

    if (forceTractography) {
        prepareMesh(root, { isTractography: true });
        targetGroup.add(root);
        return;
    }

    if (hasNamedTracts) {
        root.traverse((child) => {
            if (!child.isMesh) {
                return;
            }
            const wrapper = new THREE.Group();
            wrapper.add(child.clone());
            const isTractography = isTractographyName(child.name);
            prepareMesh(wrapper, { isTractography });
            (isTractography ? tractGroup : brainGroup).add(wrapper);
        });
        return;
    }

    prepareMesh(root, { isTractography: false });
    targetGroup.add(root);
}

async function init() {
    setStatus("Modeller yükleniyor…");

    axialSlider.value = 0;
    sagittalSlider.value = 0;
    coronalSlider.value = 0;
    tractSlider.value = Math.round(CONFIG.tractographyOpacity * 100);

    try {
        const [t1, tract] = await Promise.all([
            loadModel(CONFIG.t1Url),
            loadModel(CONFIG.tractographyUrl),
        ]);

        distributeScene(t1, brainGroup, false);
        distributeScene(tract, tractGroup, true);

        updateBounds();
        updateClipPlanes();
        updateTractOpacity();
        frameCamera();
        setStatus("Sürükle: döndür · Tekerlek: yakınlaştır · Kaydırıcılar: kesit ve saydamlık");
    } catch (error) {
        console.error(error);
        setStatus("Model yüklenemedi. models/t1-brain.glb ve models/tractography.glb dosyalarını ekleyin.");
    }
}

[axialSlider, sagittalSlider, coronalSlider].forEach((slider) => {
    slider.addEventListener("input", updateClipPlanes);
});
tractSlider.addEventListener("input", updateTractOpacity);

window.addEventListener("resize", resize);

resize();
init();

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

animate();
