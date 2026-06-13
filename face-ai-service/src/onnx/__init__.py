"""
PHASE 1 — ONNX PACKAGE INITIALIZATION

Exposes all ONNX optimization components as unified API.
Coordinates model conversion → optimization → quantization → validation → runtime.
"""

import logging
from typing import Optional, Tuple, Dict, Any

# Import all ONNX components
from .converter import ONNXConverter, get_onnx_converter, ConversionMetadata
from .optimizer import ONNXOptimizer, get_onnx_optimizer, OptimizationReport
from .quantizer import ONNXQuantizer, get_onnx_quantizer, QuantizationReport, QuantizationType
from .runtime import ONNXRuntime, get_onnx_runtime, ONNXSessionPool, InferenceMetrics
from .validator import ONNXValidator, get_onnx_validator, ValidationResult

logger = logging.getLogger(__name__)

__version__ = "1.0.0"
__all__ = [
    "ONNXConverter",
    "ONNXOptimizer",
    "ONNXQuantizer",
    "ONNXRuntime",
    "ONNXValidator",
    "ONNXPipeline",
    "get_onnx_converter",
    "get_onnx_optimizer",
    "get_onnx_quantizer",
    "get_onnx_runtime",
    "get_onnx_validator",
]


class ONNXPipeline:
    """
    End-to-end ONNX optimization pipeline orchestrator.
    
    Coordinates:
      1. Model conversion (original → ONNX)
      2. Graph optimization (node fusing, dead code elimination, etc.)
      3. Quantization (INT8, FP16, or mixed precision)
      4. Validation (accuracy vs original, performance benchmarking)
      5. Runtime loading (session pool setup, warmup)
    """
    
    def __init__(self):
        self.converter = get_onnx_converter()
        self.optimizer = get_onnx_optimizer()
        self.quantizer = get_onnx_quantizer()
        self.validator = get_onnx_validator()
        self.runtime = get_onnx_runtime()
        
        self._pipeline_results = {}
        logger.info("[ONNXPipeline] Initialized")
    
    def optimize_model(
        self,
        source_model_path: str,
        source_framework: str = "mediapipe",  # mediapipe, pytorch, tensorflow
        output_name: str = None,
        quantization_type: str = "dynamic_int8",  # none, dynamic_int8, static_int8, float16, mixed
        optimization_level: str = "extended",  # none, basic, extended, all
        validate: bool = True,
        warmup: bool = True
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Run full optimization pipeline on a single model.
        
        Returns: (success, {
            "source_model": ...,
            "onnx_model": ...,
            "optimized_model": ...,
            "quantized_model": ...,
            "conversion_metadata": ...,
            "optimization_report": ...,
            "quantization_report": ...,
            "validation_result": ...,
            "inference_metrics": ...
        })
        """
        try:
            logger.info(
                f"[ONNXPipeline] Optimizing model: {source_model_path}"
                f" (framework={source_framework}, quantization={quantization_type})"
            )
            
            results = {
                "source_model": source_model_path,
                "source_framework": source_framework,
                "stage": "initialization"
            }
            
            if output_name is None:
                import os
                output_name = os.path.basename(source_model_path).replace(".", "_onnx.")
            
            # STAGE 1: Convert to ONNX
            logger.info("[ONNXPipeline] Stage 1: Converting to ONNX...")
            results["stage"] = "conversion"
            
            if source_framework == "mediapipe":
                success, onnx_path, metadata = self.converter.convert_mediapipe_face_mesh(
                    source_model_path, output_name
                )
            elif source_framework == "pytorch":
                success, onnx_path, metadata = self.converter.convert_pytorch_model(
                    source_model_path, output_name
                )
            elif source_framework == "tensorflow":
                success, onnx_path, metadata = self.converter.convert_tensorflow_model(
                    source_model_path, output_name
                )
            else:
                return False, {"error": f"Unknown framework: {source_framework}"}
            
            if not success:
                return False, {"error": f"Conversion failed: {onnx_path}"}
            
            results["onnx_model"] = onnx_path
            results["conversion_metadata"] = metadata
            
            # STAGE 2: Optimize
            logger.info("[ONNXPipeline] Stage 2: Optimizing graph...")
            results["stage"] = "optimization"
            
            success, opt_path, opt_report = self.optimizer.optimize(
                onnx_path, optimization_level=optimization_level
            )
            
            if not success:
                logger.warn(f"[ONNXPipeline] Optimization failed, using base ONNX model")
                opt_path = onnx_path
                opt_report = None
            
            results["optimized_model"] = opt_path
            results["optimization_report"] = opt_report
            
            # STAGE 3: Quantize
            logger.info(f"[ONNXPipeline] Stage 3: Quantizing ({quantization_type})...")
            results["stage"] = "quantization"
            
            quant_path = opt_path
            quant_report = None
            
            if quantization_type == "dynamic_int8":
                success, quant_path, quant_report = self.quantizer.dynamic_quantize_int8(opt_path)
            elif quantization_type == "float16":
                success, quant_path, quant_report = self.quantizer.quantize_float16(opt_path)
            elif quantization_type == "mixed_precision":
                success, quant_path, quant_report = self.quantizer.quantize_mixed_precision(opt_path)
            elif quantization_type != "none":
                return False, {"error": f"Unknown quantization type: {quantization_type}"}
            
            if not success and quantization_type != "none":
                logger.warn(f"[ONNXPipeline] Quantization failed, using optimized model")
                quant_path = opt_path
                quant_report = None
            
            results["quantized_model"] = quant_path
            results["quantization_report"] = quant_report
            
            # STAGE 4: Validate
            logger.info("[ONNXPipeline] Stage 4: Validating...")
            results["stage"] = "validation"
            
            if validate:
                passed, val_result = self.validator.full_validation(
                    quant_path,
                    source_model_path,
                    test_samples=100
                )
                results["validation_result"] = val_result
                results["validation_passed"] = passed
                
                if not passed:
                    logger.error("[ONNXPipeline] Validation FAILED — model rejected")
                    return False, results
            
            # STAGE 5: Runtime loading & warmup
            logger.info("[ONNXPipeline] Stage 5: Loading to runtime...")
            results["stage"] = "runtime"
            
            import os
            model_name = os.path.basename(quant_path)
            success = self.runtime.load_model(model_name)
            
            if not success:
                return False, {"error": "Failed to load model to runtime"}
            
            if warmup:
                logger.info("[ONNXPipeline] Stage 5b: Warming up...")
                self.runtime.warmup(model_name, num_iterations=10)
            
            metrics = self.runtime.get_metrics(model_name)
            results["inference_metrics"] = metrics
            
            # All stages complete!
            logger.info(
                f"[ONNXPipeline] ✓ Optimization pipeline COMPLETE"
                f"\n  Source: {source_model_path}"
                f"\n  Final model: {quant_path}"
                f"\n  Quantization: {quantization_type}"
            )
            
            results["stage"] = "complete"
            results["success"] = True
            
            self._pipeline_results[quant_path] = results
            return True, results
            
        except Exception as e:
            logger.error(f"[ONNXPipeline] Pipeline failed: {str(e)}", exc_info=True)
            results["error"] = str(e)
            return False, results
    
    def batch_optimize(
        self,
        model_configs: list,  # [{path, framework, quantization, ...}, ...]
    ) -> Dict[str, Tuple[bool, Dict]]:
        """Optimize multiple models (for production setup)"""
        logger.info(f"[ONNXPipeline] Batch optimizing {len(model_configs)} models")
        
        results = {}
        for config in model_configs:
            model_path = config.get("path")
            success, result = self.optimize_model(**config)
            results[model_path] = (success, result)
        
        successful = sum(1 for success, _ in results.values() if success)
        logger.info(f"[ONNXPipeline] Batch optimization complete: {successful}/{len(model_configs)} successful")
        
        return results
    
    def get_pipeline_status(self) -> Dict[str, Any]:
        """Get overall pipeline status"""
        return {
            "runtime_status": self.runtime.get_status(),
            "models_processed": len(self._pipeline_results),
            "successful_models": sum(
                1 for r in self._pipeline_results.values()
                if r.get("success", False)
            )
        }


# Global pipeline instance
_pipeline_instance: Optional[ONNXPipeline] = None


def get_onnx_pipeline() -> ONNXPipeline:
    """Get or create the ONNX pipeline singleton"""
    global _pipeline_instance
    if _pipeline_instance is None:
        _pipeline_instance = ONNXPipeline()
    return _pipeline_instance


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(name)s — %(levelname)s: %(message)s')
    
    # Test pipeline
    pipeline = get_onnx_pipeline()
    
    success, results = pipeline.optimize_model(
        source_model_path="face_mesh_lite.pbtxt",
        source_framework="mediapipe",
        quantization_type="dynamic_int8",
        optimization_level="extended",
        validate=True,
        warmup=True
    )
    
    if success:
        print("\n✓ Pipeline succeeded!")
        print(f"  Final model: {results['quantized_model']}")
        print(f"  Performance: +{results['optimization_report'].inference_latency_improvement_percent}%")
    else:
        print(f"\n✗ Pipeline failed: {results.get('error')}")
