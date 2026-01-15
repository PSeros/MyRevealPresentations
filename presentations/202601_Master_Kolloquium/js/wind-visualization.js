/**
 * Wind Visualization for reveal.js presentations
 * Displays animated wind speed and direction data over Germany
 */

class WindVisualization {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);

        // Configuration
        this.config = {
            width: options.width || 800,
            height: options.height || 600,
            dataPath: options.dataPath || './data/wind/',
            startDate: options.startDate || '2024-05-01',
            endDate: options.endDate || '2024-06-01',
            maxWindSpeed: options.maxWindSpeed || 8,
            frameDelay: options.frameDelay || 200,
            highlightIndices: options.highlightIndices || [],
            arrowScale: options.arrowScale || 15,
            arrowWidth: options.arrowWidth || 2,
            // UI Element IDs (optional - wenn nicht gesetzt, werden sie auto-generiert)
            playButtonId: options.playButtonId || null,
            pauseButtonId: options.pauseButtonId || null,
            resetButtonId: options.resetButtonId || null,
            infoElementId: options.infoElementId || null,
            errorElementId: options.errorElementId || null,
            controlsContainerId: options.controlsContainerId || null,
            // Styling-Optionen
            backgroundColor: options.backgroundColor || 'transparent',
            canvasBorder: options.canvasBorder || 'none',
            germanyFillColor: options.germanyFillColor || 'rgba(200, 200, 200, 0.3)',
            germanyBorderColor: options.germanyBorderColor || '#333',
            germanyBorderWidth: options.germanyBorderWidth || 1
        };

        // State
        this.isPlaying = false;
        this.currentFrameIndex = 0;
        this.animationId = null;
        this.data = {
            coordinates: null,
            windSpeed: null,
            windDirection: null,
            germanyGeoJSON: null,
            timestamps: []
        };

        // Canvas context
        this.canvas = null;
        this.ctx = null;

        // UI Elements
        this.playButton = null;
        this.pauseButton = null;
        this.resetButton = null;
        this.infoElement = null;
        this.errorElement = null;

        // Projection bounds (will be set after loading Germany data)
        this.bounds = null;
    }

    async init() {
        try {
            await this.loadData();
            this.createCanvas();
            this.setupUIElements();
            this.renderFrame(0);
            return true;
        } catch (error) {
            console.error('Error initializing wind visualization:', error);
            this.showError('Fehler beim Laden der Daten');
            return false;
        }
    }

    async loadData() {
        const basePath = this.config.dataPath;

        // Load all data files in parallel
        const [coordinates, windSpeed, windDirection, germanyGeoJSON] = await Promise.all([
            this.loadCSV(`${basePath}coordinates.csv`),
            this.loadCSV(`${basePath}observations_wind_speed.csv`),
            this.loadCSV(`${basePath}observations_wind_direction.csv`),
            this.loadGeoJSON(`${basePath}germany.geojson`)
        ]);

        this.data.coordinates = coordinates;
        this.data.windSpeed = windSpeed;
        this.data.windDirection = windDirection;
        this.data.germanyGeoJSON = germanyGeoJSON;

        // Filter timestamps based on date range
        this.filterTimestamps();

        // Calculate bounds from GeoJSON
        this.calculateBounds();
    }

    async loadCSV(url) {
        const response = await fetch(url);
        const text = await response.text();
        return this.parseCSV(text);
    }

    parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index]?.trim();
            });
            data.push(row);
        }

        return { headers, data };
    }

    async loadGeoJSON(url) {
        const response = await fetch(url);
        return await response.json();
    }

    filterTimestamps() {
        const start = new Date(this.config.startDate);
        const end = new Date(this.config.endDate);

        // Get timestamps from wind speed data (first column is timestamp)
        const timestamps = this.data.windSpeed.data.map(row => {
            const timestamp = row[this.data.windSpeed.headers[0]];
            return new Date(timestamp);
        }).filter(date => date >= start && date <= end);

        this.data.timestamps = timestamps;
    }

    calculateBounds() {
        // Extract bounds from GeoJSON
        let minLon = Infinity, maxLon = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;

        const processCoordinates = (coords) => {
            if (typeof coords[0] === 'number') {
                minLon = Math.min(minLon, coords[0]);
                maxLon = Math.max(maxLon, coords[0]);
                minLat = Math.min(minLat, coords[1]);
                maxLat = Math.max(maxLat, coords[1]);
            } else {
                coords.forEach(processCoordinates);
            }
        };

        this.data.germanyGeoJSON.features.forEach(feature => {
            processCoordinates(feature.geometry.coordinates);
        });

        this.bounds = {
            minLon: minLon - 0.5,
            maxLon: maxLon + 0.5,
            minLat: minLat - 0.5,
            maxLat: maxLat + 0.5
        };
    }

    createCanvas() {
        // Create only the canvas element
        this.container.innerHTML = `
            <canvas id="${this.containerId}-canvas" 
                    width="${this.config.width}" 
                    height="${this.config.height}"
                    style="border: ${this.config.canvasBorder}; background: ${this.config.backgroundColor};"></canvas>
        `;

        this.canvas = document.getElementById(`${this.containerId}-canvas`);
        this.ctx = this.canvas.getContext('2d');
    }

    setupUIElements() {
        // Setup references to UI elements (either provided IDs or auto-generated)

        // Play button
        if (this.config.playButtonId) {
            this.playButton = document.getElementById(this.config.playButtonId);
            if (this.playButton) {
                this.playButton.addEventListener('click', () => this.play());
            }
        }

        // Pause button
        if (this.config.pauseButtonId) {
            this.pauseButton = document.getElementById(this.config.pauseButtonId);
            if (this.pauseButton) {
                this.pauseButton.addEventListener('click', () => this.pause());
            }
        }

        // Reset button
        if (this.config.resetButtonId) {
            this.resetButton = document.getElementById(this.config.resetButtonId);
            if (this.resetButton) {
                this.resetButton.addEventListener('click', () => this.reset());
            }
        }

        // Info element
        if (this.config.infoElementId) {
            this.infoElement = document.getElementById(this.config.infoElementId);
        }

        // Error element
        if (this.config.errorElementId) {
            this.errorElement = document.getElementById(this.config.errorElementId);
        }

        // If controls container is specified, create default buttons there
        if (this.config.controlsContainerId && !this.config.playButtonId) {
            this.createDefaultControls();
        }
    }

    createDefaultControls() {
        const controlsContainer = document.getElementById(this.config.controlsContainerId);
        if (!controlsContainer) return;

        const autoPlayId = `${this.containerId}-play`;
        const autoPauseId = `${this.containerId}-pause`;
        const autoResetId = `${this.containerId}-reset`;
        const autoInfoId = `${this.containerId}-info`;

        controlsContainer.innerHTML = `
            <button id="${autoPlayId}" style="padding: 8px 16px; margin: 0 5px; cursor: pointer;">▶ Play</button>
            <button id="${autoPauseId}" style="padding: 8px 16px; margin: 0 5px; cursor: pointer;" disabled>⏸ Pause</button>
            <button id="${autoResetId}" style="padding: 8px 16px; margin: 0 5px; cursor: pointer;">⏮ Reset</button>
            <span id="${autoInfoId}" style="margin-left: 20px; font-family: monospace;"></span>
        `;

        this.playButton = document.getElementById(autoPlayId);
        this.pauseButton = document.getElementById(autoPauseId);
        this.resetButton = document.getElementById(autoResetId);
        this.infoElement = document.getElementById(autoInfoId);

        this.playButton.addEventListener('click', () => this.play());
        this.pauseButton.addEventListener('click', () => this.pause());
        this.resetButton.addEventListener('click', () => this.reset());
    }

    // Convert lon/lat to canvas x/y
    project(lon, lat) {
        const x = ((lon - this.bounds.minLon) / (this.bounds.maxLon - this.bounds.minLon)) * this.config.width;
        const y = this.config.height - ((lat - this.bounds.minLat) / (this.bounds.maxLat - this.bounds.minLat)) * this.config.height;
        return { x, y };
    }

    renderFrame(frameIndex) {
        if (frameIndex >= this.data.timestamps.length) {
            this.pause();
            return;
        }

        this.currentFrameIndex = frameIndex;
        const ctx = this.ctx;

        // Clear canvas
        if (this.config.backgroundColor !== 'transparent') {
            ctx.fillStyle = this.config.backgroundColor;
            ctx.fillRect(0, 0, this.config.width, this.config.height);
        } else {
            ctx.clearRect(0, 0, this.config.width, this.config.height);
        }

        // Draw Germany outline
        this.drawGermany();

        // Get wind data for current timestamp
        const windData = this.getWindDataForFrame(frameIndex);

        // Draw wind arrows
        this.drawWindArrows(windData);

        // Draw highlighted locations
        this.drawHighlightedLocations();

        // Update info text
        this.updateInfo(frameIndex);
    }

    drawGermany() {
        const ctx = this.ctx;

        ctx.strokeStyle = this.config.germanyBorderColor;
        ctx.lineWidth = this.config.germanyBorderWidth;
        ctx.fillStyle = this.config.germanyFillColor;

        this.data.germanyGeoJSON.features.forEach(feature => {
            const coords = feature.geometry.coordinates;
            this.drawGeoJSONCoordinates(coords, feature.geometry.type);
        });
    }

    drawGeoJSONCoordinates(coords, type) {
        const ctx = this.ctx;

        if (type === 'Polygon') {
            coords.forEach(ring => {
                ctx.beginPath();
                ring.forEach((point, i) => {
                    const { x, y } = this.project(point[0], point[1]);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            });
        } else if (type === 'MultiPolygon') {
            coords.forEach(polygon => {
                this.drawGeoJSONCoordinates(polygon, 'Polygon');
            });
        }
    }

    getWindDataForFrame(frameIndex) {
        const timestamp = this.data.timestamps[frameIndex];
        const windData = [];

        // Find matching row in wind data
        const speedRow = this.data.windSpeed.data[frameIndex];
        const dirRow = this.data.windDirection.data[frameIndex];

        if (!speedRow || !dirRow) return windData;

        // Iterate through coordinates
        this.data.coordinates.data.forEach((coord, i) => {
            const lat = parseFloat(coord.Latitude);
            const lon = parseFloat(coord.Longitude);
            const name = coord.Name;

            // Column index is i+1 because first column is timestamp
            const speedKey = this.data.windSpeed.headers[i + 1];
            const dirKey = this.data.windDirection.headers[i + 1];

            const speed = parseFloat(speedRow[speedKey]);
            const direction = parseFloat(dirRow[dirKey]);

            if (!isNaN(speed) && !isNaN(direction)) {
                windData.push({ lat, lon, speed, direction, name, index: i });
            }
        });

        return windData;
    }

    drawWindArrows(windData) {
        const ctx = this.ctx;

        windData.forEach(point => {
            const { x, y } = this.project(point.lon, point.lat);

            // Color based on wind speed
            const normalizedSpeed = Math.min(point.speed / this.config.maxWindSpeed, 1);
            const color = this.getColorForSpeed(normalizedSpeed);

            // Convert meteorological wind direction to radians
            // Wind direction indicates where wind is coming FROM
            const angleRad = (point.direction + 180) * Math.PI / 180;

            // Arrow length based on speed
            const arrowLength = this.config.arrowScale * (point.speed / this.config.maxWindSpeed);

            this.drawArrow(x, y, angleRad, arrowLength, color);
        });
    }

    drawArrow(x, y, angle, length, color) {
        const ctx = this.ctx;

        const dx = Math.cos(angle - Math.PI / 2) * length;
        const dy = Math.sin(angle - Math.PI / 2) * length;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = this.config.arrowWidth;

        // Draw arrow shaft
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.stroke();

        // Draw arrow head
        const headLen = length * 0.3;
        const headAngle = Math.PI / 6;

        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(
            x + dx - headLen * Math.cos(angle - Math.PI / 2 - headAngle),
            y + dy - headLen * Math.sin(angle - Math.PI / 2 - headAngle)
        );
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(
            x + dx - headLen * Math.cos(angle - Math.PI / 2 + headAngle),
            y + dy - headLen * Math.sin(angle - Math.PI / 2 + headAngle)
        );
        ctx.stroke();
    }

    getColorForSpeed(normalized) {
        // Viridis-inspired color scheme
        const colors = [
            [68, 1, 84],      // dark purple
            [59, 82, 139],    // blue
            [33, 145, 140],   // teal
            [94, 201, 98],    // green
            [253, 231, 37]    // yellow
        ];

        const index = normalized * (colors.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const t = index - lower;

        if (lower === upper) {
            return `rgb(${colors[lower].join(',')})`;
        }

        const r = Math.round(colors[lower][0] * (1 - t) + colors[upper][0] * t);
        const g = Math.round(colors[lower][1] * (1 - t) + colors[upper][1] * t);
        const b = Math.round(colors[lower][2] * (1 - t) + colors[upper][2] * t);

        return `rgb(${r},${g},${b})`;
    }

    drawHighlightedLocations() {
        const ctx = this.ctx;

        this.config.highlightIndices.forEach(index => {
            const coord = this.data.coordinates.data[index];
            if (!coord) return;

            const lat = parseFloat(coord.Latitude);
            const lon = parseFloat(coord.Longitude);
            const { x, y } = this.project(lon, lat);

            // Draw red circle
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();

            // Draw index label
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(index.toString(), x, y - 10);
        });
    }

    updateInfo(frameIndex) {
        if (!this.infoElement) return;

        const timestamp = this.data.timestamps[frameIndex];
        const dateStr = timestamp.toISOString().split('T')[0];
        const timeStr = timestamp.toISOString().split('T')[1].slice(0, 5);
        this.infoElement.textContent = `${dateStr} ${timeStr} UTC`;
        // this.infoElement.textContent = `Frame ${frameIndex + 1}/${this.data.timestamps.length} | ${dateStr} ${timeStr} UTC`;
    }

    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        if (this.playButton) this.playButton.disabled = true;
        if (this.pauseButton) this.pauseButton.disabled = false;

        const animate = () => {
            if (!this.isPlaying) return;

            this.renderFrame(this.currentFrameIndex);
            this.currentFrameIndex++;

            if (this.currentFrameIndex >= this.data.timestamps.length) {
                this.pause();
                return;
            }

            this.animationId = setTimeout(animate, this.config.frameDelay);
        };

        animate();
    }

    pause() {
        this.isPlaying = false;
        if (this.animationId) {
            clearTimeout(this.animationId);
            this.animationId = null;
        }
        if (this.playButton) this.playButton.disabled = false;
        if (this.pauseButton) this.pauseButton.disabled = true;
    }

    reset() {
        this.pause();
        this.currentFrameIndex = 0;
        this.renderFrame(0);
    }

    destroy() {
        this.pause();
        this.container.innerHTML = '';
    }

    showError(message) {
        if (this.errorElement) {
            this.errorElement.textContent = message;
        } else {
            console.error(message);
        }
    }
}

// Export for use in reveal.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WindVisualization;
}