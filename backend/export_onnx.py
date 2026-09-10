"""
One-time conversion: exports AI_MODULE's trained PyTorch weights to ONNX, for
the lighter-memory ONNX Runtime inference path used on constrained hosts (see
onnx_infer.py). AI_MODULE's own .pth checkpoint is left untouched — this just
produces a sibling oil_segmentation_model.onnx file next to it.

Run from the backend/ directory (with its venv active):
    python export_onnx.py

Verifies the exported model against the original before writing anything, so
a broken export never silently replaces a working one.
"""

import sys
from pathlib import Path

import numpy as np
import torch

AI_MODULE_DIR = Path(__file__).resolve().parent.parent / "AI_MODULE"
sys.path.insert(0, str(AI_MODULE_DIR / "inference"))

from model import load_model  # noqa: E402

PTH_PATH = AI_MODULE_DIR / "models" / "oil_segmentation_model.pth"
ONNX_PATH = AI_MODULE_DIR / "models" / "oil_segmentation_model.onnx"


def main():
    print(f"Loading {PTH_PATH} ...")
    model, _ = load_model(str(PTH_PATH), device=torch.device("cpu"))
    model.eval()

    dummy = torch.randn(1, 1, 256, 256, dtype=torch.float32)

    print(f"Exporting to {ONNX_PATH} ...")
    torch.onnx.export(
        model, dummy, str(ONNX_PATH),
        input_names=["input"], output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=13,
        dynamo=False,
    )

    print("Verifying against the original torch model...")
    import onnxruntime as ort
    session = ort.InferenceSession(str(ONNX_PATH), providers=["CPUExecutionProvider"])

    rng = np.random.default_rng(42)
    test_input = rng.random((1, 1, 256, 256), dtype=np.float32)

    with torch.no_grad():
        torch_out = model(torch.from_numpy(test_input)).numpy()
    onnx_out = session.run(["output"], {"input": test_input})[0]

    max_diff = float(np.abs(torch_out - onnx_out).max())
    print(f"Max abs difference vs. torch: {max_diff:.2e}")
    assert max_diff < 1e-3, "ONNX export diverges from the torch model — not safe to use."
    print("OK — ONNX model matches the torch model.")


if __name__ == "__main__":
    main()
