import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GameState, Worm, WeaponType } from '../types';
import { TERRAIN_WIDTH, TERRAIN_SEGMENTS, WATER_LEVEL, COLORS, MAX_POWER } from '../constants';
import { UIOverlay } from './UIOverlay';

// --- Helper Types within component scope for ThreeJS references ---
interface GameRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  terrainGeometry: THREE.PlaneGeometry;
  wormsMeshes: THREE.Group[];
  projectileMesh: THREE.Mesh;
  explosionMesh: THREE.Mesh;
  particles: THREE.Points;
}

export const WormsGame: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  
  // Game State
  const [gameState, setGameState] = useState<GameState>(GameState.WAITING_FOR_INPUT);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0);
  const [wind, setWind] = useState(Math.random() * 0.2 - 0.1);
  const [power, setPower] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [worms, setWorms] = useState<Worm[]>([
    { id: 1, teamId: 1, name: 'Hans', hp: 100, position: { x: -40, y: 0, z: 0 }, rotation: 0, aimAngle: 0.5, isDead: false },
    { id: 2, teamId: 2, name: 'Fritz', hp: 100, position: { x: 40, y: 0, z: 0 }, rotation: Math.PI, aimAngle: 0.5, isDead: false },
    { id: 3, teamId: 1, name: 'Greta', hp: 100, position: { x: -20, y: 0, z: 0 }, rotation: 0, aimAngle: 0.8, isDead: false },
    { id: 4, teamId: 2, name: 'Otto', hp: 100, position: { x: 20, y: 0, z: 0 }, rotation: Math.PI, aimAngle: 0.8, isDead: false },
  ]);

  // Refs for mutable game data to avoid re-renders in game loop
  const gameData = useRef({
    worms: [] as Worm[], // Mirrored state for loop access
    currentWormIndex: 0,
    projectile: {
      active: false,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      mesh: null as THREE.Mesh | null
    },
    keys: {
      ArrowLeft: false,
      ArrowRight: false,
      ArrowUp: false,
      ArrowDown: false,
      Space: false
    },
    charging: false,
    chargeStartTime: 0,
    terrainHeights: new Float32Array(TERRAIN_SEGMENTS + 1),
    cameraTarget: new THREE.Vector3(0, 10, 40),
    explosionParticles: [] as { pos: THREE.Vector3, vel: THREE.Vector3, life: number }[]
  });

  const threeRefs = useRef<GameRefs | null>(null);

  // Sync state to ref
  useEffect(() => {
    gameData.current.worms = worms;
  }, [worms]);

  useEffect(() => {
    gameData.current.currentWormIndex = currentTurnIndex;
  }, [currentTurnIndex]);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.SKY_TOP);
    scene.fog = new THREE.FogExp2(COLORS.SKY_BOTTOM, 0.008);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 20, 60);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    // 5. Terrain Generation
    // We use a PlaneGeometry with many segments.
    // Vertices will be displaced to create hills.
    const terrainGeo = new THREE.PlaneGeometry(TERRAIN_WIDTH, 40, TERRAIN_SEGMENTS, 10);
    terrainGeo.rotateX(-Math.PI / 2);

    // Procedural Heightmap (Simple Sine waves + Noise approximation)
    const posAttribute = terrainGeo.attributes.position;
    const vertex = new THREE.Vector3();
    
    // Initialize height data in our ref for physics checks
    // We only care about the top row of vertices (z approx 0 or center of the strip) logic-wise
    // but visually we displace everything.
    // The plane is centered at 0,0,0.
    
    for (let i = 0; i < posAttribute.count; i++) {
      vertex.fromBufferAttribute(posAttribute, i);
      
      // Simple procedural terrain function
      const x = vertex.x;
      // Main hill shape
      let y = Math.sin(x * 0.05) * 10 + Math.sin(x * 0.1) * 5 + Math.cos(x * 0.02) * 15;
      
      // Flatten the bottom to act as "base"
      y = Math.max(y, -15); 
      
      // Add some "noise"
      y += Math.random() * 0.5;

      // Set vertex height
      posAttribute.setY(i, y);
    }
    
    // Store heights for physics collision (mapping x to y)
    // We need to sample the terrain at integer steps for simple physics
    const getTerrainHeight = (x: number) => {
        const normalizedX = (x + TERRAIN_WIDTH / 2) / TERRAIN_WIDTH;
        const index = Math.floor(normalizedX * TERRAIN_SEGMENTS);
        if (index < 0 || index >= posAttribute.count) return -50;
        // This is a simplification. Ideally, we raycast.
        // For this prototype, we re-calculate the sine wave or store it.
        // Let's rely on the math function for initial placement, then dynamic updates.
        let h = Math.sin(x * 0.05) * 10 + Math.sin(x * 0.1) * 5 + Math.cos(x * 0.02) * 15;
        return Math.max(h, -15);
    };

    // Store an accessible height map array
    for(let i=0; i <= TERRAIN_SEGMENTS; i++) {
        const x = (i / TERRAIN_SEGMENTS) * TERRAIN_WIDTH - (TERRAIN_WIDTH/2);
        gameData.current.terrainHeights[i] = getTerrainHeight(x);
    }

    terrainGeo.computeVertexNormals();
    
    const terrainMat = new THREE.MeshStandardMaterial({ 
      color: COLORS.TERRAIN, 
      roughness: 0.8,
      flatShading: true,
      side: THREE.DoubleSide
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // 6. Water
    const waterGeo = new THREE.PlaneGeometry(1000, 1000);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhongMaterial({ 
      color: COLORS.WATER, 
      transparent: true, 
      opacity: 0.8,
      shininess: 100
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = WATER_LEVEL;
    scene.add(waterMesh);

    // 7. Worms Visuals
    const wormsGroup: THREE.Group[] = [];
    worms.forEach(w => {
        const group = new THREE.Group();
        
        // Body
        const bodyGeo = new THREE.CapsuleGeometry(1, 3, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: w.teamId === 1 ? COLORS.TEAM_1 : COLORS.TEAM_2 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.5;
        body.castShadow = true;
        
        // Eyes (simple white spheres)
        const eyeGeo = new THREE.SphereGeometry(0.3);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(0.4, 2.2, 0.6);
        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(-0.4, 2.2, 0.6);
        
        // Weapon (Bazooka)
        const bazookaGeo = new THREE.CylinderGeometry(0.2, 0.3, 2.5);
        bazookaGeo.rotateZ(Math.PI / 2);
        const bazookaMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const bazooka = new THREE.Mesh(bazookaGeo, bazookaMat);
        bazooka.name = "bazooka";
        bazooka.position.set(0, 1.5, 0.5);

        group.add(body, eyeL, eyeR, bazooka);
        
        // Set initial position (y + offset)
        group.position.set(w.position.x, getTerrainHeight(w.position.x), w.position.z);
        
        scene.add(group);
        wormsGroup.push(group);
    });

    // 8. Projectile
    const projGeo = new THREE.SphereGeometry(0.5);
    const projMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const projectileMesh = new THREE.Mesh(projGeo, projMat);
    projectileMesh.visible = false;
    scene.add(projectileMesh);

    // 9. Explosion Visuals (Simple scaling sphere)
    const expGeo = new THREE.SphereGeometry(1, 16, 16);
    const expMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.8 });
    const explosionMesh = new THREE.Mesh(expGeo, expMat);
    explosionMesh.visible = false;
    scene.add(explosionMesh);

    // 10. Particle System for dirt
    const particlesGeo = new THREE.BufferGeometry();
    const particleCount = 200;
    const pPos = new Float32Array(particleCount * 3);
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ color: COLORS.DIRT, size: 0.5 });
    const particles = new THREE.Points(particlesGeo, pMat);
    particles.visible = false;
    scene.add(particles);

    threeRefs.current = {
      scene, camera, renderer, terrainGeometry: terrainGeo, wormsMeshes: wormsGroup, projectileMesh, explosionMesh, particles
    };

    // Handle Resize
    const handleResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mountRef.current?.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // --- Game Loop Logic ---

  const getTerrainHeightAt = (x: number) => {
      // Map x to index
      const i = Math.floor(((x + TERRAIN_WIDTH / 2) / TERRAIN_WIDTH) * TERRAIN_SEGMENTS);
      if (i < 0) return gameData.current.terrainHeights[0];
      if (i > TERRAIN_SEGMENTS) return gameData.current.terrainHeights[TERRAIN_SEGMENTS];
      return gameData.current.terrainHeights[i];
  };

  const deformTerrain = (x: number, radius: number) => {
    if (!threeRefs.current) return;
    
    const geo = threeRefs.current.terrainGeometry;
    const pos = geo.attributes.position;
    const centerIndex = Math.floor(((x + TERRAIN_WIDTH / 2) / TERRAIN_WIDTH) * TERRAIN_SEGMENTS);
    const radiusIndices = Math.floor((radius / TERRAIN_WIDTH) * TERRAIN_SEGMENTS * 2); // Roughly convert world radius to indices

    for (let i = centerIndex - radiusIndices; i <= centerIndex + radiusIndices; i++) {
        if (i >= 0 && i <= TERRAIN_SEGMENTS) {
            // Simple crater shape: circle equation
            const worldX = (i / TERRAIN_SEGMENTS) * TERRAIN_WIDTH - (TERRAIN_WIDTH / 2);
            const dist = Math.abs(worldX - x);
            if (dist < radius) {
                const depth = Math.sqrt(radius * radius - dist * dist);
                const currentY = gameData.current.terrainHeights[i];
                const newY = currentY - depth;
                
                // Update Logic Map
                gameData.current.terrainHeights[i] = newY;

                // Update Visual Mesh
                // The PlaneGeometry has multiple vertices along the Z axis for the same X
                // We need to lower all of them to create a "trench" or just the ones near center for a "hole"
                // Since it's 2.5D, we create a trench across Z mostly.
                const widthSegments = TERRAIN_SEGMENTS;
                const heightSegments = 10; // defined in init
                const verticesPerRow = widthSegments + 1;
                
                for(let j=0; j <= heightSegments; j++) {
                    const vertIndex = j * verticesPerRow + i;
                    // Optional: Taper depth based on Z distance from 0
                    pos.setY(vertIndex, newY);
                }
            }
        }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };

  const animate = (time: number) => {
    if (!threeRefs.current) return;
    const { renderer, scene, camera, wormsMeshes, projectileMesh, explosionMesh, particles } = threeRefs.current;
    const gd = gameData.current;
    const activeWormId = gd.currentWormIndex;
    const activeWormData = gd.worms[activeWormId];

    // 1. Handle Inputs (Only if waiting for input or charging)
    if ((gameState === GameState.WAITING_FOR_INPUT || gameState === GameState.CHARGING) && activeWormData && !activeWormData.isDead) {
        const moveSpeed = 0.1;
        const currentMesh = wormsMeshes[activeWormId];

        if (gd.keys.ArrowLeft) {
            activeWormData.position.x -= moveSpeed;
            activeWormData.rotation = Math.PI; // Face Left
            // Clamp to map
            if(activeWormData.position.x < -TERRAIN_WIDTH/2) activeWormData.position.x = -TERRAIN_WIDTH/2;
        }
        if (gd.keys.ArrowRight) {
            activeWormData.position.x += moveSpeed;
            activeWormData.rotation = 0; // Face Right
             if(activeWormData.position.x > TERRAIN_WIDTH/2) activeWormData.position.x = TERRAIN_WIDTH/2;
        }

        // Adjust Aim
        if (gd.keys.ArrowUp) {
            activeWormData.aimAngle += 0.02;
            if(activeWormData.aimAngle > Math.PI/1.5) activeWormData.aimAngle = Math.PI/1.5;
        }
        if (gd.keys.ArrowDown) {
            activeWormData.aimAngle -= 0.02;
            if(activeWormData.aimAngle < -Math.PI/2) activeWormData.aimAngle = -Math.PI/2;
        }

        // Snap Y to terrain
        activeWormData.position.y = getTerrainHeightAt(activeWormData.position.x);

        // Update Mesh transform
        if (currentMesh) {
            currentMesh.position.set(activeWormData.position.x, activeWormData.position.y, 0);
            // Rotate body to face direction
            currentMesh.rotation.y = activeWormData.rotation === 0 ? Math.PI / 2 : -Math.PI / 2;
            
            // Aim Weapon
            const bazooka = currentMesh.getObjectByName('bazooka');
            if (bazooka) {
                // Simple rotation logic for the arm/bazooka
                bazooka.rotation.x = 0; // Reset
                bazooka.rotation.z = activeWormData.aimAngle; 
            }
        }

        // Charging
        if (gd.keys.Space) {
             if (!gd.charging) {
                 setGameState(GameState.CHARGING);
                 gd.charging = true;
                 gd.chargeStartTime = time;
             }
             const chargeDuration = time - gd.chargeStartTime;
             const currentPower = Math.min((chargeDuration / 1000) * 20, MAX_POWER); // Scaling
             setPower(currentPower);
        } else if (gd.charging) {
            // Released Space -> Fire
            gd.charging = false;
            const finalPower = Math.min(((time - gd.chargeStartTime) / 1000) * 20, MAX_POWER);
            fireProjectile(finalPower);
        }
    }

    // 2. Projectile Physics
    if (gameState === GameState.PROJECTILE_FLYING && gd.projectile.active) {
        const p = gd.projectile;
        const dt = 0.016; // Fixed step approx
        
        // Apply Gravity & Wind
        p.velocity.y -= 9.8 * dt;
        p.velocity.x += wind * dt;

        p.position.x += p.velocity.x * dt * 5; // Speed multiplier
        p.position.y += p.velocity.y * dt * 5;

        if (projectileMesh) {
            projectileMesh.position.copy(p.position);
            // Rotate projectile along velocity
            // projectileMesh.lookAt(p.position.clone().add(p.velocity));
        }

        // Collision Check (Simple ground check)
        const groundH = getTerrainHeightAt(p.position.x);
        if (p.position.y <= groundH || p.position.y < WATER_LEVEL) {
            handleExplosion(p.position.x, p.position.y);
        }
        
        // Bounds check
        if (p.position.x < -TERRAIN_WIDTH/2 - 10 || p.position.x > TERRAIN_WIDTH/2 + 10) {
             setGameState(GameState.WAITING_FOR_INPUT); // Out of bounds, next turn
             nextTurn();
        }
    }

    // 3. Explosion Animation
    if (gameState === GameState.EXPLOSION) {
        if (explosionMesh.visible) {
            explosionMesh.scale.multiplyScalar(1.1);
            (explosionMesh.material as THREE.Material).opacity -= 0.05;
            if ((explosionMesh.material as THREE.Material).opacity <= 0) {
                explosionMesh.visible = false;
                setGameState(GameState.WAITING_FOR_INPUT);
                nextTurn();
            }
        }
    }

    // 4. Camera Follow
    const targetPos = new THREE.Vector3();
    if (gameState === GameState.PROJECTILE_FLYING) {
        targetPos.copy(gd.projectile.position);
    } else if (activeWormData) {
        targetPos.set(activeWormData.position.x, activeWormData.position.y, activeWormData.position.z);
    }

    // Smooth camera lerp
    gd.cameraTarget.lerp(targetPos, 0.05);
    camera.position.x = gd.cameraTarget.x;
    camera.position.y = Math.max(gd.cameraTarget.y + 10, 10); // Keep camera somewhat above
    camera.lookAt(gd.cameraTarget.x, gd.cameraTarget.y, 0);

    // Render
    renderer.render(scene, camera);
    requestRef.current = requestAnimationFrame(animate);
  };

  const fireProjectile = (powerLvl: number) => {
    const gd = gameData.current;
    const w = gd.worms[gd.currentWormIndex];
    if(!w) return;

    setGameState(GameState.PROJECTILE_FLYING);
    
    const angle = w.aimAngle;
    const dirX = w.rotation === 0 ? Math.cos(angle) : -Math.cos(angle); // Facing Right vs Left logic
    // If facing left (PI), cos(angle) needs to be inverted for X direction? 
    // Actually, standard Trig: 
    // Right (0 deg) -> cos(a), sin(a)
    // Left (180 deg) -> -cos(a), sin(a) (if aim angle is absolute vertical)
    // My rotation logic is 0 (Right) and PI (Left).
    
    const shotDirX = w.rotation === 0 ? Math.cos(angle) : -Math.cos(angle);
    const shotDirY = Math.sin(angle);

    gd.projectile.active = true;
    gd.projectile.position.set(w.position.x, w.position.y + 2, 0);
    gd.projectile.velocity.set(shotDirX * powerLvl, shotDirY * powerLvl, 0);

    if(threeRefs.current?.projectileMesh) {
        threeRefs.current.projectileMesh.visible = true;
        threeRefs.current.projectileMesh.position.copy(gd.projectile.position);
    }
    setPower(0);
  };

  const handleExplosion = (x: number, y: number) => {
     const gd = gameData.current;
     gd.projectile.active = false;
     if (threeRefs.current?.projectileMesh) threeRefs.current.projectileMesh.visible = false;

     setGameState(GameState.EXPLOSION);
     
     // Visuals
     if(threeRefs.current?.explosionMesh) {
        threeRefs.current.explosionMesh.position.set(x, y, 0);
        threeRefs.current.explosionMesh.scale.set(1,1,1);
        threeRefs.current.explosionMesh.visible = true;
        (threeRefs.current.explosionMesh.material as THREE.Material).opacity = 1;
     }

     // Deform Terrain
     deformTerrain(x, 6); // Radius 6

     // Damage Worms
     const explosionRadius = 8;
     const maxDamage = 40;
     const newWorms = gd.worms.map(w => {
         const dx = w.position.x - x;
         const dy = w.position.y - y; // Simple distance, y might be off if fallen
         const dist = Math.sqrt(dx*dx + dy*dy);
         if (dist < explosionRadius) {
             const dmg = Math.floor(maxDamage * (1 - dist/explosionRadius));
             w.hp -= dmg;
             // Apply knockback
             const knockbackForce = (explosionRadius - dist) * 0.5;
             w.position.x += (dx / dist) * knockbackForce;
         }
         if (w.hp <= 0) w.isDead = true;
         return w;
     });
     
     setWorms([...newWorms]); // Trigger React update for UI
  };

  const nextTurn = () => {
      const gd = gameData.current;
      let nextIndex = (gd.currentWormIndex + 1) % gd.worms.length;
      // Skip dead worms
      let attempts = 0;
      while(gd.worms[nextIndex].isDead && attempts < gd.worms.length) {
          nextIndex = (nextIndex + 1) % gd.worms.length;
          attempts++;
      }

      if(attempts >= gd.worms.length) {
          // Game Over
          setGameState(GameState.GAME_OVER);
          return;
      }

      setCurrentTurnIndex(nextIndex);
      
      // Randomize wind
      const newWind = (Math.random() * 2 - 1) * 0.5; // -0.5 to 0.5
      setWind(newWind);
      
      // Reset timer (visual only in this prototype)
      setTimeLeft(30);
  };

  // Input Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') gameData.current.keys.Space = true;
        if (e.code === 'ArrowLeft') gameData.current.keys.ArrowLeft = true;
        if (e.code === 'ArrowRight') gameData.current.keys.ArrowRight = true;
        if (e.code === 'ArrowUp') gameData.current.keys.ArrowUp = true;
        if (e.code === 'ArrowDown') gameData.current.keys.ArrowDown = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') gameData.current.keys.Space = false;
        if (e.code === 'ArrowLeft') gameData.current.keys.ArrowLeft = false;
        if (e.code === 'ArrowRight') gameData.current.keys.ArrowRight = false;
        if (e.code === 'ArrowUp') gameData.current.keys.ArrowUp = false;
        if (e.code === 'ArrowDown') gameData.current.keys.ArrowDown = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    requestRef.current = requestAnimationFrame(animate);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
        <div ref={mountRef} className="w-full h-full absolute top-0 left-0 z-0" />
        <UIOverlay 
            currentTurnIndex={currentTurnIndex}
            worms={worms}
            wind={wind}
            power={power}
            gameState={gameState}
        />
    </>
  );
};