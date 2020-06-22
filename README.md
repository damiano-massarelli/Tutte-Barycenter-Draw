# Graph Toolkit

Try it [here](https://damiano-massarelli.github.io/Tutte-Barycenter-Draw/index.html)

## GPU Algorithm

An implementation of the paper [Improved Efficiency of Spring Embedders: Taking Advantage of GPU programming](https://www.labri.fr/perso/melancon/Visual_Analytics_Course/lib/exe/fetch.php?media=bordeaux20132014:auber_chiricota_2007_gpu.pdf) using JavaScript and WebGL2.

Since WebGL compute shaders are still an experimental feature in many browsers, the GPU algorithm is implemented using a fragment
shader and the result is output to a floating point frame buffer. The topology of the graph and nodes positions are encoded
inside textures as explained in the paper.

When visualizing a graph with `40k` nodes using a GTX 1050, the algorithm runs almost 900 times faster than the
same algorithm executed using an i7-7700HQ.

The GPU algorithm shows a very noticeable speedup on mobile devices too.

## Rendering

In order to render the graph layout computed by the GPU algorithm, nodes positions should be extracted from the
output frame buffer so that rendering commands can by issued by the CPU. Unfortunately, exchanging data between the GPU
and the GPU (using [glReadPixels](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/readPixels)) can
be slow, especially for large graphs.

To circumvent this issue, a custom WebGL renderer was developed. This renderer reads the algorithm output directly from the
GPU memory thus avoiding the expensive data exchange operations. The renderer also uses [instanced rendering](https://en.wikipedia.org/wiki/Geometry_instancing) to draw nodes and
edges as fast as possible. What's more, the renderer can also be used with CPU algorithms.

## Performance

Performance are always measured while using the WebGL renderer.<br />
CPU: `i7-7700HQ`<br />
GPU: `GTX 1050`

Number of nodes / _time for step_ (ms) | GPU algorithm | CPU Algorithm | speedup
-------------------------------------- | ------------- | ------------- | --------
100                                    | 1.9           | 1.8           | 0.95
1K                                     | 1.9           | 14.4          | 7.6
5K                                     | 1.8           | 389.0         | 216.1
10K                                    | 2.3           | 1523.2        | 662.2
20K                                    | 7.8           | 5447.8        | 698.4
40K                                    | 28.3          | 25308.8       | 894.3
50K                                    | 41.7          | n/a           | n/a

_time for step_ is the total time to render a frame. It includes the time required to compute the next position for all the nodes of the graph and the actual time to render the graph: `algorithm + rendering`.

Make sure to run your browser using your dedicated GPU and to disable vsync (`chrome --disable-frame-rate-limit --disable-gpu-vsync`).
