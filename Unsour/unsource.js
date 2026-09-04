// unsource.js
import * as CORE from './three.core.js';
import * as TSL from './three.webgpu.js';

export class UnSource {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        
        // Initialize the Core Renderer using your local three.core.js file
        this.renderer = new CORE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = CORE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        // Setup Scene & Camera
        this.scene = new CORE.Scene();
        this.scene.background = new CORE.Color(0x0d0d12);
        
        this.camera = new CORE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 2, 8);

        // Lighting Architecture
        this.scene.add(new CORE.AmbientLight(0xffffff, 0.2));
        const dirLight = new CORE.DirectionalLight(0xffffff, 2.0);
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
        const geometry = new CORE.SphereGeometry(1, 32, 32);
        
        // Standard materials from your core file
        const material = new CORE.MeshStandardMaterial({
            color: colorHex,
            roughness: 0.2,
            metalness: 0.8
        });

        const mesh = new CORE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        
        this.scene.add(mesh);
        this.objects.push(mesh);
        return mesh;
    }

    render() {
        requestAnimationFrame(() => this.render());
        
        // Basic rotation logic
        this.objects.forEach(obj => {
            obj.rotation.y += 0.01;
            obj.rotation.x += 0.005;
        });

        this.renderer.render(this.scene, this.camera);
    }
}

