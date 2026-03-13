import React from 'react';
import { Phase, Step, PHASE_INFO, STEP_INFO, getPhaseForStep } from '../../shared/pipeline';

interface StepNavigationProps {
  currentStep: Step;
  completedSteps: Step[];
  onStepChange: (step: Step) => void;
}

const PHASES = [Phase.SETUP, Phase.PART1_KOREAN, Phase.PART2_KO_EN, Phase.PART3_KEY_EXPR, Phase.FINISHING];
const PHASE_SHORT_LABELS: Record<Phase, string> = {
  [Phase.SETUP]: 'Setup',
  [Phase.PART1_KOREAN]: 'Part 1',
  [Phase.PART2_KO_EN]: 'Part 2',
  [Phase.PART3_KEY_EXPR]: 'Part 3',
  [Phase.FINISHING]: 'Finishing',
};

const COLORS = {
  active: '#18A0FB',
  completed: '#1BC47D',
  future: '#E5E5E5',
  text: '#333333',
  textMuted: '#999999',
  highlightBg: 'rgba(24, 160, 251, 0.08)',
};

export const StepNavigation: React.FC<StepNavigationProps> = ({
  currentStep,
  completedSteps,
  onStepChange,
}) => {
  const currentPhase = getPhaseForStep(currentStep);
  const currentStepInfo = STEP_INFO[currentStep];
  const currentPhaseSteps = PHASE_INFO[currentPhase].steps;

  const isStepCompleted = (step: Step) => completedSteps.includes(step);

  const isPhaseCompleted = (phase: Phase) =>
    PHASE_INFO[phase].steps.every((s) => completedSteps.includes(s));

  const isPhaseActive = (phase: Phase) => phase === currentPhase;

  const isPhaseReachable = (phase: Phase) => {
    const phaseIdx = PHASES.indexOf(phase);
    const currentPhaseIdx = PHASES.indexOf(currentPhase);
    return phaseIdx <= currentPhaseIdx;
  };

  const getPhaseColor = (phase: Phase) => {
    if (isPhaseCompleted(phase)) return COLORS.completed;
    if (isPhaseActive(phase)) return COLORS.active;
    return COLORS.future;
  };

  const canNavigateTo = (step: Step) =>
    isStepCompleted(step) || step === currentStep;

  const handlePrev = () => {
    const stepNum = currentStep as number;
    if (stepNum > 1) {
      onStepChange((stepNum - 1) as Step);
    }
  };

  const handleNext = () => {
    const stepNum = currentStep as number;
    if (stepNum < 20) {
      onStepChange((stepNum + 1) as Step);
    }
  };

  const currentStepIdx = currentPhaseSteps.indexOf(currentStep);

  return (
    <div style={{ padding: '6px 10px 4px', userSelect: 'none' }}>
      {/* Phase bar with dots and connecting lines */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: '6px' }}>
        {PHASES.map((phase, i) => {
          const color = getPhaseColor(phase);
          const isActive = isPhaseActive(phase);
          const completed = isPhaseCompleted(phase);

          return (
            <React.Fragment key={phase}>
              {/* Connecting line before dot (except first) */}
              {i > 0 && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    backgroundColor: isPhaseReachable(phase) ? COLORS.completed : COLORS.future,
                    maxWidth: '32px',
                  }}
                />
              )}
              {/* Phase dot + label */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  cursor: isPhaseReachable(phase) ? 'pointer' : 'default',
                  opacity: isPhaseReachable(phase) ? 1 : 0.5,
                }}
                onClick={() => {
                  if (isPhaseReachable(phase)) {
                    const firstStep = PHASE_INFO[phase].steps[0];
                    if (canNavigateTo(firstStep)) {
                      onStepChange(firstStep);
                    }
                  }
                }}
                title={PHASE_INFO[phase].title}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: completed || isActive ? color : 'transparent',
                    border: `2px solid ${color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {completed && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.2 5.7L6.5 2.3" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    color: isActive ? COLORS.active : completed ? COLORS.completed : COLORS.textMuted,
                    fontWeight: isActive ? 600 : 400,
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                  }}
                >
                  {PHASE_SHORT_LABELS[phase]}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Current step detail with nav buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: COLORS.highlightBg,
          borderRadius: '6px',
          padding: '4px 6px',
          minHeight: '32px',
        }}
      >
        {/* Back button */}
        <button
          onClick={handlePrev}
          disabled={(currentStep as number) <= 1}
          style={{
            background: 'none',
            border: 'none',
            cursor: (currentStep as number) <= 1 ? 'default' : 'pointer',
            padding: '2px 4px',
            fontSize: '14px',
            color: (currentStep as number) <= 1 ? COLORS.future : COLORS.active,
            lineHeight: 1,
            borderRadius: '4px',
            flexShrink: 0,
          }}
          title="Previous step"
        >
          &#8592;
        </button>

        {/* Step info (center) */}
        <div style={{ textAlign: 'center', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: COLORS.text,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            Step {currentStep}: {currentStepInfo.titleKo}
            <span
              style={{
                fontSize: '10px',
                fontWeight: 400,
                color: COLORS.textMuted,
                marginLeft: '4px',
              }}
            >
              ({currentStepIdx + 1}/{currentPhaseSteps.length})
            </span>
          </div>
          <div
            style={{
              fontSize: '11px',
              color: COLORS.textMuted,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentStepInfo.description}
          </div>
        </div>

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={(currentStep as number) >= 20}
          style={{
            background: 'none',
            border: 'none',
            cursor: (currentStep as number) >= 20 ? 'default' : 'pointer',
            padding: '2px 4px',
            fontSize: '14px',
            color: (currentStep as number) >= 20 ? COLORS.future : COLORS.active,
            lineHeight: 1,
            borderRadius: '4px',
            flexShrink: 0,
          }}
          title="Next step"
        >
          &#8594;
        </button>
      </div>
    </div>
  );
};

export default StepNavigation;
