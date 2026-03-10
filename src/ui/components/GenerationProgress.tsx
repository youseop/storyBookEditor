import React from 'react';

interface GenerationProgressProps {
  current: number;
  total: number;
  isGenerating: boolean;
  onCancel: () => void;
}

const GenerationProgress: React.FC<GenerationProgressProps> = ({
  current,
  total,
  isGenerating,
  onCancel,
}) => {
  if (!isGenerating) return null;

  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="progress-container">
      <div className="progress-bar-wrapper">
        <div
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="progress-text">
        <span>Generating images: {current}/{total}</span>
        <button className="btn btn-danger" onClick={onCancel} style={{ padding: '4px 10px', fontSize: 11 }}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default GenerationProgress;
