import * as THREE from '../vendor/three/three.module.min.js';

const stage = document.querySelector('#legacy-pillar');

if (stage) {
    const canvas = stage.querySelector('.pillar-canvas');
    const labelsLayer = stage.querySelector('.pillar-labels');
    const fallback = stage.querySelector('.pillar-fallback');
    const legacyContent = document.querySelector('#legacy-content');
    const yearSections = [...document.querySelectorAll('.year-archive[data-year]')]
        .sort((a, b) => Number(a.dataset.year) - Number(b.dataset.year));
    const years = yearSections.map((section) => section.dataset.year);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');

    let renderer;
    let scene;
    let camera;
    let pillar;
    let resizeObserver;
    let animationFrame = 0;
    let lastTime = performance.now();
    let lockedYear = null;
    let disposed = false;

    const cells = [];
    const interactiveCells = [];
    const cellByYear = new Map();
    const markerByYear = new Map();
    const archiveTimers = new WeakMap();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(10, 10);
    const extractionDirection = new THREE.Vector3();
    const inversePillarRotation = new THREE.Quaternion();
    const markerLocalPosition = new THREE.Vector3();
    const cameraLocalPosition = new THREE.Vector3();
    const cellHeight = 1.12;
    const cellGap = 0.06;
    const minimumCellCount = 5;
    const hexFaceStep = (Math.PI * 2) / 6;
    const spinDuration = 900;

    function addEdges(mesh, geometry) {
        const edgeGeometry = new THREE.EdgesGeometry(geometry, 22);
        const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x0d0d0d });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        mesh.add(edges);
    }

    function createMarker(year) {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'pillar-year-marker';
        marker.dataset.yearMarker = year;
        marker.setAttribute('aria-label', `Open the ${year} IndyHAX archive`);
        marker.setAttribute('aria-pressed', 'false');
        marker.textContent = year;

        marker.addEventListener('click', () => selectYear(year));

        labelsLayer.appendChild(marker);
        markerByYear.set(year, marker);
    }

    function createCell(year, index, interactive = true) {
        const geometry = new THREE.CylinderGeometry(1.42, 1.42, cellHeight, 6, 1, false);
        const material = new THREE.MeshStandardMaterial({
            color: 0xf4d35e,
            emissive: 0x000000,
            roughness: 0.48,
            metalness: 0.08
        });
        const mesh = new THREE.Mesh(geometry, material);
        const y = index * (cellHeight + cellGap);
        mesh.position.set(0, y, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (interactive) mesh.userData.year = year;
        mesh.userData.basePosition = new THREE.Vector3(0, y, 0);
        mesh.userData.targetPosition = mesh.position.clone();
        mesh.userData.targetScale = 1;
        mesh.userData.spinQueue = 0;
        mesh.userData.isSpinning = false;
        mesh.userData.spinStartedAt = 0;
        mesh.userData.spinStartRotation = 0;
        mesh.userData.spinTargetRotation = 0;
        addEdges(mesh, geometry);
        pillar.add(mesh);
        cells.push(mesh);
        if (interactive) {
            interactiveCells.push(mesh);
            cellByYear.set(year, mesh);
            createMarker(year);
        }
    }

    function createScene() {
        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-3.4, 3.4, 4.5, -4.5, 0.1, 50);

        renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: !coarsePointer.matches,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer.matches ? 1.35 : 1.8));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;

        pillar = new THREE.Group();
        pillar.rotation.y = -0.36;
        pillar.scale.set(0.64, 1, 0.64);
        scene.add(pillar);

        yearSections.forEach((section, index) => createCell(section.dataset.year, index));
        for (let index = years.length; index < Math.max(years.length, minimumCellCount); index += 1) {
            createCell(null, index, false);
        }

        const plinthGeometry = new THREE.CylinderGeometry(1.62, 1.62, 0.14, 6);
        const plinthMaterial = new THREE.MeshStandardMaterial({
            color: 0x0d0d0d,
            roughness: 0.58,
            metalness: 0.12
        });
        const plinth = new THREE.Mesh(plinthGeometry, plinthMaterial);
        plinth.position.y = -cellHeight / 2 - 0.12;
        pillar.add(plinth);

        const ambient = new THREE.HemisphereLight(0xffffff, 0xd9d9d9, 2.1);
        scene.add(ambient);

        const key = new THREE.DirectionalLight(0xffffff, 3.3);
        key.position.set(-4, 7, 7);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        scene.add(key);

        const redRim = new THREE.DirectionalLight(0xe63946, 1.7);
        redRim.position.set(5, 2, -3);
        scene.add(redRim);

        canvas.addEventListener('click', onCanvasClick);
        canvas.addEventListener('webglcontextlost', onContextLost);
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stage);

        resize();
        hideArchive(false);
        stage.dataset.enhanced = 'true';
        fallback.setAttribute('aria-hidden', 'true');
        scheduleRender();
    }

    function resize() {
        if (!renderer || !camera) return;
        const width = Math.max(stage.clientWidth, 1);
        const height = Math.max(stage.clientHeight, 1);
        const aspect = width / height;
        const visibleCellCount = Math.max(years.length, minimumCellCount);
        const topY = Math.max(visibleCellCount - 1, 0) * (cellHeight + cellGap) + cellHeight / 2;
        const bottomY = -cellHeight / 2 - 0.2;
        const vertical = Math.max(6.2, topY - bottomY + 0.75);
        const centerY = (topY + bottomY) / 2;

        camera.left = (-vertical * aspect) / 2;
        camera.right = (vertical * aspect) / 2;
        camera.top = vertical / 2;
        camera.bottom = -vertical / 2;
        camera.position.set(4.8, centerY + 3.3, 8.2);
        camera.lookAt(0, centerY, 0);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        scheduleRender();
    }

    function updatePointer(event) {
        const bounds = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    }

    function raycast() {
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(interactiveCells, false)[0]?.object || null;
    }

    function onCanvasClick(event) {
        updatePointer(event);
        const cell = raycast();
        if (cell?.userData.year) selectYear(cell.userData.year);
    }

    function onArchiveWheel(event) {
        if (!legacyContent) return;
        const maxScroll = Math.max(legacyContent.scrollHeight - legacyContent.clientHeight, 0);
        const atTop = legacyContent.scrollTop <= 1;
        const atBottom = legacyContent.scrollTop >= maxScroll - 1;
        const leavingTop = event.deltaY < 0 && atTop;
        const leavingBottom = event.deltaY > 0 && atBottom;

        if (!leavingTop && !leavingBottom) return;
        event.preventDefault();
        window.scrollBy({ top: event.deltaY, left: 0, behavior: 'auto' });
    }

    function selectYear(year, animateContent = true) {
        if (!cellByYear.has(year)) return;
        queueCellSpin(cellByYear.get(year));
        if (lockedYear === year) {
            lockedYear = null;
            hideArchive();
            markerByYear.get(year)?.setAttribute('aria-pressed', 'false');
            scheduleRender();
            return;
        }

        const changed = lockedYear !== year;
        lockedYear = year;
        showArchive(year, changed && animateContent);

        markerByYear.forEach((marker, markerYear) => {
            marker.setAttribute('aria-pressed', String(markerYear === year));
        });
        scheduleRender();
    }

    function startCellSpin(cell, startTime = performance.now()) {
        cell.userData.isSpinning = true;
        cell.userData.spinStartedAt = startTime;
        cell.userData.spinStartRotation = cell.rotation.y;
        cell.userData.spinTargetRotation = cell.rotation.y + Math.PI * 2;
    }

    function queueCellSpin(cell) {
        if (!cell || reducedMotion.matches) return;
        cell.userData.spinQueue += 1;
        if (!cell.userData.isSpinning) startCellSpin(cell);
        scheduleRender();
    }

    function updateCellSpin(cell, now) {
        if (!cell.userData.isSpinning) return false;
        if (reducedMotion.matches) {
            cell.rotation.y = 0;
            cell.userData.spinQueue = 0;
            cell.userData.isSpinning = false;
            return false;
        }

        const progress = THREE.MathUtils.clamp(
            (now - cell.userData.spinStartedAt) / spinDuration,
            0,
            1
        );
        const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
        cell.rotation.y = THREE.MathUtils.lerp(
            cell.userData.spinStartRotation,
            cell.userData.spinTargetRotation,
            eased
        );

        if (progress < 1) return true;

        cell.userData.spinQueue -= 1;
        if (cell.userData.spinQueue > 0) {
            startCellSpin(cell, now);
            return true;
        }

        cell.rotation.y = 0;
        cell.userData.isSpinning = false;
        return false;
    }

    function showArchive(year, animateContent = true) {
        yearSections.forEach((section) => {
            const active = section.dataset.year === year;
            const wasHidden = section.hidden;
            clearTimeout(archiveTimers.get(section));

            if (!active) {
                hideSection(section, animateContent);
                return;
            }

            section.hidden = false;
            section.removeAttribute('aria-hidden');
            section.classList.remove('is-leaving');
            if (active && wasHidden && animateContent && !reducedMotion.matches) {
                if (legacyContent) legacyContent.scrollTop = 0;
                section.classList.remove('is-entering');
                void section.offsetWidth;
                section.classList.add('is-entering');
                archiveTimers.set(section, setTimeout(() => {
                    section.classList.remove('is-entering');
                }, 950));
            }
        });
    }

    function hideSection(section, animateContent = true) {
        clearTimeout(archiveTimers.get(section));
        section.setAttribute('aria-hidden', 'true');

        if (section.hidden || !animateContent || reducedMotion.matches) {
            section.hidden = true;
            section.classList.remove('is-entering', 'is-leaving');
            return;
        }

        section.classList.remove('is-entering');
        void section.offsetWidth;
        section.classList.add('is-leaving');
        archiveTimers.set(section, setTimeout(() => {
            section.hidden = true;
            section.classList.remove('is-leaving');
        }, 920));
    }

    function hideArchive(animateContent = true) {
        yearSections.forEach((section) => {
            hideSection(section, animateContent);
        });
    }

    function updateTargets() {
        extractionDirection.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
        inversePillarRotation.copy(pillar.quaternion).invert();
        extractionDirection.applyQuaternion(inversePillarRotation).normalize();

        cells.forEach((cell) => {
            const base = cell.userData.basePosition;
            const selected = cell.userData.year && cell.userData.year === lockedYear;
            const extraction = reducedMotion.matches ? 0 : selected ? 0.4 : 0;

            cell.userData.targetPosition.copy(base).addScaledVector(extractionDirection, extraction);
            cell.userData.targetScale = 1;
            cell.material.color.set(0xf4d35e);
            cell.material.emissive.set(0x000000);
        });
    }

    function updateMarkers() {
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        const world = new THREE.Vector3();
        cameraLocalPosition.copy(camera.position);
        pillar.worldToLocal(cameraLocalPosition);

        markerByYear.forEach((marker, year) => {
            const cell = cellByYear.get(year);
            const viewAngle = Math.atan2(
                cameraLocalPosition.x - cell.position.x,
                cameraLocalPosition.z - cell.position.z
            );
            const faceAngle = Math.round((viewAngle - Math.PI / 6) / hexFaceStep) * hexFaceStep + Math.PI / 6;
            const rotatingFaceAngle = faceAngle + cell.rotation.y;
            const faceVisibility = Math.cos(rotatingFaceAngle - viewAngle);
            const labelOpacity = THREE.MathUtils.clamp((faceVisibility - 0.08) / 0.5, 0, 1);
            const labelScaleX = THREE.MathUtils.clamp(faceVisibility, 0.08, 1);

            markerLocalPosition.set(
                cell.position.x + Math.sin(rotatingFaceAngle) * 1.435,
                cell.position.y,
                cell.position.z + Math.cos(rotatingFaceAngle) * 1.435
            );
            world.copy(markerLocalPosition);
            pillar.localToWorld(world);
            world.project(camera);
            marker.style.left = `${(world.x * 0.5 + 0.5) * width}px`;
            marker.style.top = `${(-world.y * 0.5 + 0.5) * height}px`;
            marker.style.opacity = String(labelOpacity);
            marker.style.pointerEvents = faceVisibility > 0.45 ? 'auto' : 'none';
            marker.style.transform = `translate(-50%, -50%) scaleX(${labelScaleX})`;
        });
    }

    function scheduleRender() {
        if (disposed || animationFrame || document.hidden) return;
        lastTime = performance.now();
        animationFrame = requestAnimationFrame(render);
    }

    function render(now) {
        animationFrame = 0;
        if (disposed || document.hidden) return;

        const delta = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        const easing = 1 - Math.exp(-10 * delta);
        let unsettled = false;

        updateTargets();
        cells.forEach((cell) => {
            cell.position.lerp(cell.userData.targetPosition, easing);
            const scale = THREE.MathUtils.lerp(cell.scale.x, cell.userData.targetScale, easing);
            cell.scale.setScalar(scale);
            const spinning = updateCellSpin(cell, now);
            if (cell.position.distanceToSquared(cell.userData.targetPosition) > 0.00001 ||
                Math.abs(cell.scale.x - cell.userData.targetScale) > 0.001 ||
                spinning) {
                unsettled = true;
            }
        });

        renderer.render(scene, camera);
        updateMarkers();
        if (unsettled) animationFrame = requestAnimationFrame(render);
    }

    function onContextLost(event) {
        event.preventDefault();
        stage.dataset.enhanced = 'false';
        labelsLayer.hidden = true;
        fallback.removeAttribute('aria-hidden');
        showArchive(years[0], false);
        dispose();
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(animationFrame);
        resizeObserver?.disconnect();
        canvas.removeEventListener('click', onCanvasClick);
        canvas.removeEventListener('webglcontextlost', onContextLost);
        legacyContent?.removeEventListener('wheel', onArchiveWheel);
        scene?.traverse((object) => {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
            else object.material?.dispose();
        });
        renderer?.dispose();
    }

    fallback.querySelectorAll('[data-fallback-year]').forEach((control) => {
        control.addEventListener('click', (event) => {
            const year = event.currentTarget.dataset.fallbackYear;
            showArchive(year);
            document.querySelector(`#archive-${year}`)?.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        });
    });
    reducedMotion.addEventListener('change', scheduleRender);
    document.addEventListener('visibilitychange', scheduleRender);
    legacyContent?.addEventListener('wheel', onArchiveWheel, { passive: false });
    window.addEventListener('pagehide', dispose, { once: true });

    try {
        createScene();
    } catch (error) {
        console.warn('The 3D year pillar could not start; using the static year control.', error);
        stage.dataset.enhanced = 'false';
    }
}
