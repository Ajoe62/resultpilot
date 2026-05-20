import { useEffect, useState } from "react";

export default function CircularScore({ percentage }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frameId = 0;
    let startTime = 0;

    const step = (timestamp) => {
      if (!startTime) {
        startTime = timestamp;
      }

      const progress = Math.min((timestamp - startTime) / 900, 1);
      const nextValue = Math.round(progress * percentage);
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [percentage]);

  return (
    <div
      className="score-ring"
      style={{
        background: `conic-gradient(#1d72f5 ${displayValue * 3.6}deg, #dbeafe 0deg)`,
      }}
    >
      <div className="score-ring__inner">
        <strong>{displayValue}%</strong>
      </div>
    </div>
  );
}
