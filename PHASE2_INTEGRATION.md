# Phase 2 Integration Guide - medical.ts

This document explains the changes needed to `src/medical/medical.ts` to integrate the lasso masking functionality.

## Step 1: Add Import

At the top of the file, add the import for LassoComputePipeline:

```typescript
import { LassoComputePipeline } from "./lassoComputePipeline";
```

## Step 2: Add Global Variable

Add this global variable with the other pipeline variables (around line 44):

```typescript
let gLassoComputePipeline: LassoComputePipeline|undefined = undefined;
```

## Step 3: Initialize Compute Pipeline

In the `onInit` function, after initializing the lasso render pipeline (around line 286), add:

```typescript
// LASSO: Create compute pipeline for mask generation
gLassoComputePipeline = new LassoComputePipeline(ctx.Device());
await gLassoComputePipeline.initialize(
  dicomMetadata!.width,
  dicomMetadata!.height,
  dicomMetadata!.numSlices
);

// Initialize with empty mask (all visible)
await gLassoComputePipeline.clearMask();

// Bind mask texture to volume pipelines
gVolumeRenderPipeline!.setMaskTexture(gLassoComputePipeline.getMaskTextureView());
gCTFVolumeRenderPipeline!.setMaskTexture(gLassoComputePipeline.getMaskTextureView());
```

## Step 4: Trigger Mask Computation

Modify the `onDrawEnd` callback in the lasso input handler (around line 259) to trigger mask computation:

**Replace:**
```typescript
onDrawEnd: () => {
  // Unlock camera controls when done
  gMouseEventHandler?.setEnabled(true);
  gWidgetDragHandler?.setEnabled(true);
  console.log('🔓 Camera unlocked - lasso complete');

  // Trigger one HQ render to show final result
  usingHQ = true;
  numberOfHQRenderings = 0;
}
```

**With:**
```typescript
onDrawEnd: async () => {
  // Unlock camera controls when done
  gMouseEventHandler?.setEnabled(true);
  gWidgetDragHandler?.setEnabled(true);
  console.log('🔓 Camera unlocked - lasso complete');

  // Compute mask if lasso manager has contours
  if (gLassoManager && gLassoManager.getContourCount() > 0 && gLassoComputePipeline) {
    console.log('🔄 Computing lasso mask...');

    const contours = gLassoManager.getActiveContours();
    const modelMatrix = volumeRoot!.transform!.getWorldMatrix();

    await gLassoComputePipeline.computeMask(contours, modelMatrix);

    // Update mask texture in volume pipelines
    gVolumeRenderPipeline!.setMaskTexture(gLassoComputePipeline.getMaskTextureView());
    gCTFVolumeRenderPipeline!.setMaskTexture(gLassoComputePipeline.getMaskTextureView());

    gLassoManager.markClean();

    console.log('✓ Lasso mask applied to volume');
  }

  // Trigger one HQ render to show final result
  usingHQ = true;
  numberOfHQRenderings = 0;
}
```

## Step 5: Add Undo/Redo Support (Optional but Recommended)

Add keyboard event listeners for undo/redo after the 'L' key handler (around line 294):

```typescript
// LASSO: Set up Ctrl+Z (undo) and Ctrl+Shift+Z (redo)
window.addEventListener('keydown', async (e) => {
  if (!gLassoManager || !gLassoComputePipeline) return;

  // Ctrl+Z - Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    if (gLassoManager.canUndo()) {
      e.preventDefault();
      gLassoManager.undo();
      console.log('↶ Undo lasso');

      // Recompute mask
      const contours = gLassoManager.getActiveContours();
      if (contours.length > 0) {
        const modelMatrix = volumeRoot!.transform!.getWorldMatrix();
        await gLassoComputePipeline.computeMask(contours, modelMatrix);
      } else {
        await gLassoComputePipeline.clearMask();
      }

      // Update pipelines
      gVolumeRenderPipeline!.setMaskTexture(gLassoComputePipeline.getMaskTextureView());
      gCTFVolumeRenderPipeline!.setMaskTexture(gLassoComputePipeline.getMaskTextureView());

      numberOfHQRenderings = 0;
    }
  }

  // Ctrl+Shift+Z - Redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
    if (gLassoManager.canRedo()) {
      e.preventDefault();
      gLassoManager.redo();
      console.log('↷ Redo lasso');

      // Recompute mask
      const contours = gLassoManager.getActiveContours();
      const modelMatrix = volumeRoot!.transform!.getWorldMatrix();
      await gLassoComputePipeline.computeMask(contours, modelMatrix);

      // Update pipelines
      gVolumeRenderPipeline!.setMaskTexture(gLassoComputePipeline.getMaskTextureView());
      gCTFVolumeRenderPipeline!.setMaskTexture(gLassoComputePipeline.getMaskTextureView());

      numberOfHQRenderings = 0;
    }
  }
});
```

## Summary of Changes

### Imports
- Add `LassoComputePipeline` import

### Global Variables
- Add `gLassoComputePipeline` variable

### Initialization (in onInit)
1. Create LassoComputePipeline instance
2. Initialize with volume dimensions
3. Clear mask (all visible initially)
4. Bind mask texture to both volume pipelines

### Event Handling
1. Make `onDrawEnd` async
2. Compute mask after drawing completes
3. Update both volume pipelines with new mask
4. Add Ctrl+Z / Ctrl+Shift+Z for undo/redo (optional)

### No Changes Needed
- Render loop (Phase 2 works automatically once mask is bound)
- Uniform updates (existing code works as-is)
- Other event handlers

## Testing Phase 2

After integration:

1. **Press 'L'** - Enable lasso mode
2. **Draw a contour** - Drag to create a closed loop
3. **Release mouse** - Contour completes
4. **Wait for compute** - Console shows "Computing lasso mask..." → "Lasso mask applied"
5. **Volume updates** - Voxels inside the contour disappear!

### Expected Console Output:
```
🎨 LASSO MODE ENABLED - Draw with left mouse button
🔒 Camera locked - drawing lasso
Finishing lasso contour: 1234 raw points
Simplified to 87 points
✓ Lasso contour completed: 87 points (from 1234 raw)
🔓 Camera unlocked - lasso complete
🔄 Computing lasso mask...
✓ Lasso mask computed in 45.23ms (1 contours, 64×64×38 workgroups)
✓ Lasso mask applied to volume
```

### Undo/Redo Testing:
```
Ctrl+Z → ↶ Undo lasso
✓ Lasso mask computed in 12.34ms (0 contours, ...)
Volume restored

Ctrl+Shift+Z → ↷ Redo lasso
✓ Lasso mask computed in 43.21ms (1 contours, ...)
Volume cut again
```

## Performance Notes

- **First contour**: ~40-80ms (depends on volume size)
- **Additional contours**: Similar (each contour tested independently)
- **Undo to 0 contours**: ~10-20ms (just clearing mask)
- **Volume size impact**:
  - 256³ = ~17M voxels → ~20-40ms
  - 512³ = ~134M voxels → ~80-150ms

The compute shader is highly parallel and runs entirely on GPU, so it's very fast even for large volumes!

## Troubleshooting

### "Lasso mask computed but volume unchanged"
- Check console for compute errors
- Verify mask texture is bound to active pipeline
- Ensure shader has lasso mask binding

### "Compute takes too long"
- Check volume dimensions (printed in console)
- Verify workgroup dispatch sizes are reasonable
- Consider adding mask resolution downsampling (future optimization)

### "Mask not updating on undo"
- Verify `markClean()` is called after compute
- Check that `isDirty()` flag is working
- Ensure contour stack is properly managed

## What's Next (Phase 3)

Phase 3 will add:
- UI toggle button for lasso mode (instead of 'L' key)
- Undo/Redo buttons in tools panel
- Touch support for Android (two-finger drawing)
- Contour list display (show active contours)
- Clear all button
- Contour visibility toggle
