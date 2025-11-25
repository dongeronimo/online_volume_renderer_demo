# Chunked Volume 

I want to reduce the amount of sampling and calculations as much as possible. To do so i'll reduce wasted rays by completely avoiding transparent volumes. Transparent volumes are a waste of processing.

### Transparent Volume
A transparent volume is a region of space where all voxels will be rendered as transparent. If all the voxels in the volume are transparent then the volume is transparent. I can evaluate if the volume's value range intersects with the visible range, like the window/level.

### Smoothing
This strategy benefits a lot of smoothing to eliminate noise but i can't simply apply gaussian smooth to a medical image. I need anisotropic smoothing. I chose to move the smoothing step from javascript to the python, the dicom_converter.py.

There's a risk though: if i do that cpu-side it's very slow. If i do that using cuda i'll need expensive servers the day i put it online because the server will need a cuda-capable gpu. Either an expensive EC2 or a physical server at home. It's a tradeoff i'm willing to do for now.

### Chunk size tradeoff
The smaller the size of the size the more precise will be the evaluation of the empty space skip. But the smaller the chunk, the more meshes i'll have and the more draw calls and the more blending i'll have to to in the fixed pipeline.

the draw calls can be solved with instancing: I reduce the draw calls by increasing the bureaucracy (since i'll have to manage instance data buffers) and doing transfers each frame, having to transfer the current model matrix of each instance each frame. Maybe by only updating the model matrix instance buffer if is dirty i can save time.


In the end this optimization failed badly: the insane amount of overdraw and the overloading of the fixed function blender made it worse then no optimization!. That's why I went
to bricking: using a 3d texture to evaluate, in the shader, where to skip.