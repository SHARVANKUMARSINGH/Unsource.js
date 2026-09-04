/**
 * UnSource Engine - You Don't Need comments Right?
 */
class UnSourceEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        // Using WebGL2 for advanced features and better Framebuffer support
        this.gl = this.canvas.getContext('webgl2', { antialias: false });
        if (!this.gl) throw new Error("WebGL2 not supported");

        this.meshes = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.initMath();
        this.initShaders();
        this.initPostProcessing();
        this.initGeometry();
        
        this.camera = { rx: 0.5, ry: 0.5, dist: 15 };
        this.light = { pos: [5.0, 5.0, 5.0], color: [300.0, 300.0, 300.0] }; // High intensity for PBR
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        if (this.fbo) this.initPostProcessing(); // Rebuild FBOs on resize
    }

    initMath() {
        this.m4 = {
            identity: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
            multiply: (a, b) => {
                let c = new Float32Array(16);
                for(let i=0; i<4; i++) for(let j=0; j<4; j++)
                    c[i*4+j] = a[i*4+0]*b[0*4+j] + a[i*4+1]*b[1*4+j] + a[i*4+2]*b[2*4+j] + a[i*4+3]*b[3*4+j];
                return c;
            },
            translation: (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]),
            scaling: (x, y, z) => new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]),
            xRotation: (r) => new Float32Array([1,0,0,0, 0,Math.cos(r),Math.sin(r),0, 0,-Math.sin(r),Math.cos(r),0, 0,0,0,1]),
            yRotation: (r) => new Float32Array([Math.cos(r),0,-Math.sin(r),0, 0,1,0,0, Math.sin(r),0,Math.cos(r),0, 0,0,0,1]),
            perspective: (fov, aspect, near, far) => {
                const f = Math.tan(Math.PI * 0.5 - 0.5 * fov), rangeInv = 1.0 / (near - far);
                return new Float32Array([f/aspect, 0,0,0, 0,f,0,0, 0,0,(near+far)*rangeInv,-1, 0,0,near*far*rangeInv*2,0]);
            }
        };
    }

    compileShader(type, source) {
        const s = this.gl.createShader(type);
        this.gl.shaderSource(s, source);
        this.gl.compileShader(s);
        if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    createProgram(vs, fs) {
        const p = this.gl.createProgram();
        this.gl.attachShader(p, this.compileShader(this.gl.VERTEX_SHADER, vs));
        this.gl.attachShader(p, this.compileShader(this.gl.FRAGMENT_SHADER, fs));
        this.gl.linkProgram(p);
        return p;
    }

    initShaders() {
        // --- PBR SHADER (Metallic/Roughness) ---
        const pbrVS = `#version 300 es
            in vec4 a_position; in vec3 a_normal;
            uniform mat4 u_wvp; uniform mat4 u_world;
            out vec3 v_worldPos; out vec3 v_normal;
            void main() {
                v_worldPos = (u_world * a_position).xyz;
                v_normal = mat3(u_world) * a_normal;
                gl_Position = u_wvp * a_position;
            }`;

        const pbrFS = `#version 300 es
            precision highp float;
            in vec3 v_worldPos; in vec3 v_normal;
            uniform vec3 u_camPos; uniform vec3 u_lightPos; uniform vec3 u_lightColor;
            uniform vec3 u_albedo; uniform float u_metallic; uniform float u_roughness;
            out vec4 fragColor;

            const float PI = 3.14159265359;

            float DistributionGGX(vec3 N, vec3 H, float roughness) {
                float a = roughness*roughness; float a2 = a*a;
                float NdotH = max(dot(N, H), 0.0); float NdotH2 = NdotH*NdotH;
                float num = a2;
                float denom = (NdotH2 * (a2 - 1.0) + 1.0);
                return num / (PI * denom * denom);
            }

            float GeometrySchlickGGX(float NdotV, float roughness) {
                float r = (roughness + 1.0); float k = (r*r) / 8.0;
                return NdotV / (NdotV * (1.0 - k) + k);
            }

            float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
                float NdotV = max(dot(N, V), 0.0); float NdotL = max(dot(N, L), 0.0);
                return GeometrySchlickGGX(NdotV, roughness) * GeometrySchlickGGX(NdotL, roughness);
            }

            vec3 fresnelSchlick(float cosTheta, vec3 F0) {
                return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
            }

            void main() {
                vec3 N = normalize(v_normal);
                vec3 V = normalize(u_camPos - v_worldPos);
                vec3 F0 = mix(vec3(0.04), u_albedo, u_metallic);
                
                vec3 L = normalize(u_lightPos - v_worldPos);
                vec3 H = normalize(V + L);
                float distance = length(u_lightPos - v_worldPos);
                float attenuation = 1.0 / (distance * distance);
                vec3 radiance = u_lightColor * attenuation;

                float NDF = DistributionGGX(N, H, u_roughness);   
                float G   = GeometrySmith(N, V, L, u_roughness);      
                vec3 F    = fresnelSchlick(max(dot(H, V), 0.0), F0);       
                
                vec3 kS = F; vec3 kD = vec3(1.0) - kS; kD *= 1.0 - u_metallic;	  
                
                vec3 numerator    = NDF * G * F;
                float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
                vec3 specular     = numerator / denominator;  
                    
                float NdotL = max(dot(N, L), 0.0);                
                vec3 Lo = (kD * u_albedo / PI + specular) * radiance * NdotL;
                
                vec3 ambient = vec3(0.03) * u_albedo;
                vec3 color = ambient + Lo;
                
                // HDR Tonemapping & Gamma correction handled in post-processing
                fragColor = vec4(color, 1.0);
            }`;

        // --- POST-PROCESSING SHADERS (Bloom + Tonemapping) ---
        const quadVS = `#version 300 es
            in vec2 a_position; out vec2 v_texCoord;
            void main() { v_texCoord = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.0, 1.0); }`;

        const bloomFS = `#version 300 es
            precision mediump float;
            in vec2 v_texCoord; uniform sampler2D u_scene; uniform sampler2D u_bloomBlur;
            out vec4 fragColor;
            void main() {
                vec3 hdrColor = texture(u_scene, v_texCoord).rgb;
                vec3 bloomColor = texture(u_bloomBlur, v_texCoord).rgb;
                hdrColor += bloomColor; // Additive blend
                // Exposure tone mapping
                vec3 result = vec3(1.0) - exp(-hdrColor * 1.0);
                // Gamma correction
                result = pow(result, vec3(1.0 / 2.2));
                fragColor = vec4(result, 1.0);
            }`;

        this.pbrProg = this.createProgram(pbrVS, pbrFS);
        this.bloomProg = this.createProgram(quadVS, bloomFS);
    }

    initPostProcessing() {
        const gl = this.gl;
        // Basic FBO setup for capturing the scene
        this.fbo = gl.createFramebuffer();
        this.sceneTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Setup Screen Quad
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    }

    initGeometry() {
        // High-poly sphere generation for testing PBR
        let pos = [], norm = [], ind = [];
        const res = 30;
        for (let lat = 0; lat <= res; lat++) {
            let theta = lat * Math.PI / res;
            let sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
            for (let lon = 0; lon <= res; lon++) {
                let phi = lon * 2 * Math.PI / res;
                let x = Math.cos(phi) * sinTheta, y = cosTheta, z = Math.sin(phi) * sinTheta;
                pos.push(x, y, z); norm.push(x, y, z);
            }
        }
        for (let lat = 0; lat < res; lat++) {
            for (let lon = 0; lon < res; lon++) {
                let first = (lat * (res + 1)) + lon, second = first + res + 1;
                ind.push(first, second, first + 1, second, second + 1, first + 1);
            }
        }

        const gl = this.gl;
        this.sphere = {
            pBuf: gl.createBuffer(), nBuf: gl.createBuffer(), iBuf: gl.createBuffer(), length: ind.length
        };
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sphere.pBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sphere.nBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norm), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphere.iBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ind), gl.STATIC_DRAW);
    }

    addMesh(x, y, z, r, g, b, metallic, roughness) {
        this.meshes.push({ x, y, z, color: [r, g, b], metallic, roughness });
    }

    render() {
        const gl = this.gl;
        
        // PASS 1: Render scene to Framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.clearColor(0.05, 0.05, 0.05, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);

        gl.useProgram(this.pbrProg);
        
        // Camera math
        let view = this.m4.translation(0, 0, -this.camera.dist);
        view = this.m4.multiply(view, this.m4.xRotation(this.camera.rx));
        view = this.m4.multiply(view, this.m4.yRotation(this.camera.ry));
        const proj = this.m4.perspective(Math.PI/3, this.canvas.width/this.canvas.height, 0.1, 100.0);
        const viewProj = this.m4.multiply(proj, view);
        
        // Extract cam pos from view matrix inverse (simplified)
        gl.uniform3fv(gl.getUniformLocation(this.pbrProg, "u_camPos"), [0, 0, this.camera.dist]); 
        gl.uniform3fv(gl.getUniformLocation(this.pbrProg, "u_lightPos"), this.light.pos);
        gl.uniform3fv(gl.getUniformLocation(this.pbrProg, "u_lightColor"), this.light.color);

        this.meshes.forEach(obj => {
            let world = this.m4.translation(obj.x, obj.y, obj.z);
            let wvp = this.m4.multiply(viewProj, world);
            
            gl.uniformMatrix4fv(gl.getUniformLocation(this.pbrProg, "u_wvp"), false, wvp);
            gl.uniformMatrix4fv(gl.getUniformLocation(this.pbrProg, "u_world"), false, world);
            
            gl.uniform3fv(gl.getUniformLocation(this.pbrProg, "u_albedo"), obj.color);
            gl.uniform1f(gl.getUniformLocation(this.pbrProg, "u_metallic"), obj.metallic);
            gl.uniform1f(gl.getUniformLocation(this.pbrProg, "u_roughness"), obj.roughness);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.sphere.pBuf);
            const pLoc = gl.getAttribLocation(this.pbrProg, "a_position");
            gl.enableVertexAttribArray(pLoc); gl.vertexAttribPointer(pLoc, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.sphere.nBuf);
            const nLoc = gl.getAttribLocation(this.pbrProg, "a_normal");
            gl.enableVertexAttribArray(nLoc); gl.vertexAttribPointer(nLoc, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphere.iBuf);
            gl.drawElements(gl.TRIANGLES, this.sphere.length, gl.UNSIGNED_SHORT, 0);
        });

        // PASS 2: Post-Processing (Bloom Add + Tonemapping) rendered to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(this.bloomProg);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.uniform1i(gl.getUniformLocation(this.bloomProg, "u_scene"), 0);

        // In a full pipeline, we'd blur here. For performance, we emulate glow via tonemap exposure.
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const qLoc = gl.getAttribLocation(this.bloomProg, "a_position");
        gl.enableVertexAttribArray(qLoc); gl.vertexAttribPointer(qLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        requestAnimationFrame(() => this.render());
    }
}

