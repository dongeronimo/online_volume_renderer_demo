# Installation and running

## Dicom converter dependencies:
- Cuda toolkit (because we do perona-malik on gpu)
- cupy
- cupy-cuda13x
- numpy
- pydicom

Running dicom_converter_deps.ps1 SHOULD install everything that's necessary for the converter to run.

### Running the converter:
```  python dicom_converter.py -i "D:\dicoms\abdomem-feet-first" -o "C:\dev\webgpu_engine\public\medical\abdomen-feet-first" --iterations 25 --chunk-size 32 ``` will take the dicoms in the -i folder, convert each slice to raw blobs of [0,1] float16, will also apply perona malik anisotropic smoothing (in this example 25 iterations). It will also generate a data structure that holds the min and max value of --chunk-size voxels. Mind that --chunk-size must be multiple of 16. This structure is to do empty space skipping.

### Outputs:
- metadata.json : description of the series with info like dimensions, spacing, etc.
- chunk_minmax.bin: data structure for empty space skipping. Flat array of [min0, max0, min1, max1, ...], Size: numChunksX × numChunksY × numChunksZ × 2 × 4 bytes
- slice_xxxx.raw: the slices, float16, normalized.

### Troubleshooting: 

- If the converter does not find cupy after you run dicom_converter_deps that's because it failed silently to install cupy due to the lack of the cuda toolkit.
- If the converter crashes with something like ``` Error during conversion: CuPy failed to load nvrtc64_120_0.dll ``` that's because you are missing the cuda toolkit.
- Dll version mismatch: install pip install cupy-cuda13x and remove the other cupy-cuda
- ``` cudaErrorInsufficientDriver: CUDA driver version is insufficient for CUDA runtime version ```: update drivers
