
class SpringEmbeddersGPUAlgorithm {

    constructor(graph, width, height){
        this._graph = null;
        this._width = width;
        this._height = height;

        this._gpu = SpringEmbeddersGPUAlgorithm._getGpuInstance();

        this._speed = 0.01;

        // Spring Embedders data
        this._springRestLength = 10
        this._springDampening = 1 / 10;
        this._charge = 150 * 150

        // GPU Data
        this._positionsMatrix = []
        this._adjacencyMatrix = []
        this._nodesMatrix = []

        this._kernel = null;

        this.setGraph(graph);
    }

    setProperties(properties) {
        this._speed = properties.speed || this._speed;
        this._springDampening = properties.springDampening || this._springDampening;
        this._springRestLength = properties.springRestLength || this._springRestLength;
        this._charge = properties.charge || this._charge;
    }

    _createKernel() {
        const outputSize = this._nodesMatrix.length;

        const gpu = SpringEmbeddersGPUAlgorithm._getGpuInstance();
        this._kernel = gpu.createKernel(function(positions) {
            const row = this.thread.y;
            const col = this.thread.x;

            const [x, y] = positions[row][col];

            return [x + this.constants.speed, y + 0.1];
        }).setOutput([outputSize, outputSize])
        .setConstants({});

        this._kernel.constants.speed = 3;

    }

    _create3dMatrix(rows, columns, depth, defaultValue) {
        const matrix = [];
        for (let row = 0; row < rows; row++) {
            const currentRow = [];
            matrix.push(currentRow);
            for (let col = 0; col < columns; col++) {
                if (depth == 1) {
                    currentRow.push(defaultValue);
                }
                else if (depth > 1) {
                    currentRow.push(Array(depth).fill(defaultValue));
                }
            }
        }

        return matrix;
    }

    _indexToMatrixCoordinates(index, rows, columns) {
        const row = Math.floor(index / rows);
        const col = index % columns;
        return [row, col];
    }

    /**
     * Creates the position, node and adjacency matrices.
     * The position matrix contains the position of the nodes.
     * The node matrix contains, for each node, the coordinates of the adjacency matrix in which
     * the list of its neighbours are stored. Each element of the node matrix also contains the number
     * of neighbours for that node.
     * The adjacency matrix contains, for each node, the list of its neigbours.
     * Given the node with index i, we can access its position using the respective matrix
     * coordinates: [i / rows, i % columns]. The same coordinates can be used to access the node matrix.
     * To access the adjacency matrix for a node you need adjacencyMatrix[nodesMatrix[i / rows, i % columns]].
     * nodes and positions matrices have size sqrt(n) x sqrt(n) where n is the number of nodes.
     * The adjacency matrix has size sqrt(m) x sqrt(m) where m is the number of edges.
     */
    _createGraphMatrices() {
        const graph = this._graph;

        // We encode N nodes in a matrix whose size is sqrt(n) x sqrt(n)
        const nodesMatrixSize = Math.ceil(Math.sqrt(graph.nodes.length));

        // for edges we should still check whther they are directed (if so multiply by 2)
        // using the number of neighbours is probably safer
        const totalNumberOfEdges = graph.nodes.map(node => node.neighbours.length).reduce((total, current) => total + current, 0);
        const adjacencyMatrixSize = Math.ceil(Math.sqrt(totalNumberOfEdges));

        // create the matrices that will hold the node and neighbor data
        // nodesMatrixSize x nodesMatrixSize x 3: we store the coordinates to the adjacencyMatrix and the number of neighbours
        const nodesMatrix = this._create3dMatrix(nodesMatrixSize, nodesMatrixSize, 3, -1);

        // adjacencyMatrixSize x adjacencyMatrixSize x 2: we store the coordinates of nodes
        const adjacencyMatrix = this._create3dMatrix(adjacencyMatrixSize, adjacencyMatrixSize, 2, -1);

        // the position matrix nodesMatrixSize x nodesMatrixSize x 2: just store x and y
        const positionsMatrix = this._create3dMatrix(nodesMatrixSize, nodesMatrixSize, 2, -1);

        let adjMatrixNextFreeSpotIndex = 0;

        for (let i = 0; i < graph.nodes.length; i++) {
            const currentNode = graph.nodes[i];

            // find the matrix coordinates of the next available spot in the adjacency matrix
            const [adjX, adjY] = this._indexToMatrixCoordinates(adjMatrixNextFreeSpotIndex, adjacencyMatrixSize, adjacencyMatrixSize);

            // find the coordinates of this node
            const [nodeX, nodeY] = this._indexToMatrixCoordinates(i, nodesMatrixSize, nodesMatrixSize);

            // the nodes matrix stores the first position of the adjacency matrix where the 
            // neighbours can be found as well as the number of neighbours
            nodesMatrix[nodeX][nodeY] = [adjX, adjY, currentNode.neighbours.length];

            // store the initial positions
            positionsMatrix[nodeX][nodeY] = [currentNode.x, currentNode.y];

            // for each neighbour, store its node matrix position in the adjacency list
            currentNode.neighbours.forEach(neighbour => {
                const [adjX, adjY] = this._indexToMatrixCoordinates(adjMatrixNextFreeSpotIndex, adjacencyMatrixSize, adjacencyMatrixSize);

                const neighbourIndex = graph.nodes.indexOf(neighbour);
                const neighbourCoords = this._indexToMatrixCoordinates(neighbourIndex, nodesMatrixSize, nodesMatrixSize);

                adjacencyMatrix[adjX][adjY] = neighbourCoords;

                adjMatrixNextFreeSpotIndex++;
            });
        }

        this._positionsMatrix = positionsMatrix;
        this._adjacencyMatrix = adjacencyMatrix;
        this._nodesMatrix = nodesMatrix;
    }

    /**
     * Sets up GPU data.
     * This method uses the current graph to create the textures
     * and the kernel used to carry out computation on the GPU.
     */
    _setUpGPU() {
        this._createGraphMatrices();
        this._createKernel();
    }

    setGraph(graph) {
        this._graph = graph;
        this._graph.nodes.forEach(node => {
            node.x = this._width / 2 + (100 * Math.random()) - 50;
            node.y = this._height / 2 + (100 * Math.random() - 50);
            node.isFixed = false;
        });

        this._setUpGPU();
    }

    onCanvasSizeChanged(width, height) {
        this._width = width;
        this._height = height;
    }

    _getDistance(node, node2) {
        const deltaX = node.x - node2.x;
        const deltaY = node.y - node2.y;
        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    }

    _clamp(val, min, max) {
        return val < min ? min : (val > max ? max : val);
    }

    computeNextPositions() {
        this._kernel.constants.speed += 3;
        this._kernel.setConstants(this._kernel.constants);
        
        this._positionsMatrix = this._kernel(this._positionsMatrix);

        const rows = this._positionsMatrix.length;
        const columns = this._positionsMatrix[0].length;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const nodeIndex = row * rows + col;

                if (nodeIndex < this._graph.nodes.length) {
                    const node = this._graph.nodes[nodeIndex];
                    [node.x, node.y] = this._positionsMatrix[row][col];
                }
            }
        }
    }
}

SpringEmbeddersGPUAlgorithm._gpu = null;

SpringEmbeddersGPUAlgorithm._getGpuInstance = function() {
    if (SpringEmbeddersGPUAlgorithm._gpu === null) {
        SpringEmbeddersGPUAlgorithm._gpu = new GPU();
    }

    return SpringEmbeddersGPUAlgorithm._gpu;
}