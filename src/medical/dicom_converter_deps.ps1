# install_dependencies.ps1
# PowerShell script to install Python dependencies for DICOM converter

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DICOM Converter Dependency Installation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Python is available
Write-Host "Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "Found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "Python not found in PATH" -ForegroundColor Red
    Write-Host "Please install Python 3.8+ from https://www.python.org/" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Installing core dependencies..." -ForegroundColor Yellow
Write-Host ""

# Install base requirements
$basePackages = @(
    "numpy",
    "pydicom"
)

foreach ($package in $basePackages) {
    Write-Host "Installing $package..." -ForegroundColor Cyan
    python -m pip install --upgrade $package
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install $package" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Core dependencies installed" -ForegroundColor Green
Write-Host ""

# Try to install CuPy for GPU acceleration
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "GPU Acceleration Setup (Optional)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Attempting to install CuPy for NVIDIA GPU acceleration..." -ForegroundColor Yellow
Write-Host "Note: This requires CUDA Toolkit to be installed" -ForegroundColor Gray
Write-Host ""

# Detect CUDA version
$cudaFound = $false
$cudaVersion = ""

try {
    $nvccOutput = nvcc --version 2>&1 | Select-String "release (\d+\.\d+)"
    if ($nvccOutput) {
        $cudaVersion = $nvccOutput.Matches.Groups[1].Value
        $cudaMajor = $cudaVersion.Split('.')[0]
        $cudaFound = $true
        Write-Host "Detected CUDA $cudaVersion" -ForegroundColor Green
    }
} catch {
    Write-Host "CUDA Toolkit not detected in PATH" -ForegroundColor Yellow
}

if ($cudaFound) {
    Write-Host ""
    Write-Host "Installing CuPy for CUDA $cudaMajor..." -ForegroundColor Cyan
    
    # Map CUDA version to CuPy package
    $cupyPackage = switch ($cudaMajor) {
        "12" { "cupy-cuda12x" }
        "11" { "cupy-cuda11x" }
        default { "cupy-cuda12x" }
    }
    
    Write-Host "Using package: $cupyPackage" -ForegroundColor Gray
    python -m pip install --upgrade $cupyPackage
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "CuPy installed successfully" -ForegroundColor Green
        Write-Host "  GPU acceleration will be available" -ForegroundColor Green
    } else {
        Write-Host "CuPy installation failed" -ForegroundColor Yellow
        Write-Host "  The converter will work but smoothing will be skipped" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "CuPy installation skipped (CUDA not detected)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To enable GPU acceleration:" -ForegroundColor Cyan
    Write-Host "  1. Install NVIDIA CUDA Toolkit from:" -ForegroundColor Gray
    Write-Host "     https://developer.nvidia.com/cuda-downloads" -ForegroundColor Gray
    Write-Host "  2. Rerun this script" -ForegroundColor Gray
    Write-Host ""
    Write-Host "The converter will work but Perona-Malik smoothing will be skipped" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "numpy - Installed" -ForegroundColor Green
Write-Host "pydicom - Installed" -ForegroundColor Green

# Verify CuPy installation
$cupyStatus = python -c "import cupy" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "cupy - Installed (GPU acceleration enabled)" -ForegroundColor Green
} else {
    Write-Host "cupy - Not available (GPU acceleration disabled)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Ready to use!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Usage:" -ForegroundColor Cyan
Write-Host "  python dicom_converter.py -i INPUT_DIR -o OUTPUT_DIR" -ForegroundColor Gray
Write-Host ""
Write-Host "Options:" -ForegroundColor Cyan
Write-Host "  --no-smooth      Skip Perona-Malik smoothing" -ForegroundColor Gray
Write-Host "  --iterations N   Number of smoothing iterations (default: 5)" -ForegroundColor Gray
Write-Host ""
