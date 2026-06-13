import { motion } from 'framer-motion';
import { FaEye, FaCircleCheck, FaCircleXmark } from 'react-icons/fa6';

interface HeadMovement {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

interface LivenessIndicatorProps {
  status: 'idle' | 'detecting' | 'success' | 'failed';
  blinkCount?: number;
  headMovement?: HeadMovement;
  confidence?: number;
  className?: string;
}

const LivenessIndicator = ({
  status,
  blinkCount = 0,
  headMovement,
  confidence,
  className = '',
}: LivenessIndicatorProps) => {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      case 'detecting':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'success':
        return 'Liveness Verified';
      case 'failed':
        return 'Liveness Failed';
      case 'detecting':
        return 'Detecting Liveness...';
      default:
        return 'Ready for Liveness Check';
    }
  };

  const getHeadMovementProgress = () => {
    if (!headMovement) return 0;
    const movements = Object.values(headMovement);
    return (movements.filter(Boolean).length / movements.length) * 100;
  };

  return (
    <div className={`p-4 rounded-lg bg-gray-800 text-white ${className}`}>
      {/* Status header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <span className={`mr-2 ${getStatusColor()}`}><FaEye /></span>
          <span className="font-medium">{getStatusText()}</span>
        </div>
        {status === 'success' && (
          <span className="text-green-500 text-xl"><FaCircleCheck /></span>
        )}
        {status === 'failed' && (
          <span className="text-red-500 text-xl"><FaCircleXmark /></span>
        )}
      </div>

      {/* Confidence meter */}
      {confidence !== undefined && (
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span>Confidence</span>
            <span>{(confidence * 100).toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <motion.div
              className="bg-blue-500 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${confidence * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {/* Blink counter */}
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span>Blinks Detected</span>
          <span>{blinkCount}/2</span>
        </div>
        <div className="flex space-x-1">
          {[1, 2].map((i) => (
            <div
              key={i}
              className={`flex-1 h-2 rounded-full ${blinkCount >= i ? 'bg-green-500' : 'bg-gray-700'
                }`}
            />
          ))}
        </div>
      </div>

      {/* Head movement */}
      {headMovement && (
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span>Head Movement</span>
            <span>{getHeadMovementProgress()}% Complete</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center">
              <div
                className={`w-3 h-3 rounded-full mr-2 ${headMovement.up ? 'bg-green-500' : 'bg-gray-700'
                  }`}
              />
              <span className="text-xs">Up</span>
            </div>
            <div className="flex items-center">
              <div
                className={`w-3 h-3 rounded-full mr-2 ${headMovement.down ? 'bg-green-500' : 'bg-gray-700'
                  }`}
              />
              <span className="text-xs">Down</span>
            </div>
            <div className="flex items-center">
              <div
                className={`w-3 h-3 rounded-full mr-2 ${headMovement.left ? 'bg-green-500' : 'bg-gray-700'
                  }`}
              />
              <span className="text-xs">Left</span>
            </div>
            <div className="flex items-center">
              <div
                className={`w-3 h-3 rounded-full mr-2 ${headMovement.right ? 'bg-green-500' : 'bg-gray-700'
                  }`}
              />
              <span className="text-xs">Right</span>
            </div>
          </div>
        </div>
      )}

      {/* Animation for detecting state */}
      {status === 'detecting' && (
        <div className="flex justify-center mt-2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"
          />
        </div>
      )}
    </div>
  );
};

export default LivenessIndicator;