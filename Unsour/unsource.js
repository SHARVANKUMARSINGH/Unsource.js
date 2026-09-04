// unsource.js
import * as THREE from './three.webgpu.js';

export class UnSource {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        
        // THE FIX: Use WebGPURenderer. It handles all the TSL Node math 
        // and falls back to WebGL automatically on mobile.
        this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        // Setup Scene & Camera
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d0d12);
        
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 2, 8);

        // Lighting Architecture
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(5, 10, 5);
        this.scene.add(dirLight);

        this.objects = [];
        window.addEventListener('resize', () => this.resize(), false);
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // --- UNSOURCE API ---

    addMesh(x, y, z, colorHex) {
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        
        const material = new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: 0.2,
            metalness: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        
        this.scene.add(mesh);
        this.objects.push(mesh);
        return mesh;
    }

    render() {
        requestAnimationFrame(() => this.render());
        
        // Basic rotation logic so we know it's alive
        this.objects.forEach(obj => {
            obj.rotation.y += 0.01;
            obj.rotation.x += 0.005;
        });

        this.renderer.render(this.scene, this.camera);
    }
}
