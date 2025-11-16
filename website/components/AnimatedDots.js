import { useEffect, useState } from 'react';

const AnimatedDots = () => {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDotCount((prev) => (prev + 1) % 5);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
      // Use an inline-flex container with a fixed minimum width
      <span className="inline-flex space-x-[1px] ml-1" style={{ minWidth: '1.5em', display: 'inline-block' }}>
      <span style={{ opacity: dotCount >= 1 ? 1 : 0 }}>.</span>
      <span style={{ opacity: dotCount >= 2 ? 1 : 0 }}>.</span>
      <span style={{ opacity: dotCount >= 3 ? 1 : 0 }}>.</span>
    </span>
  );
};

export default AnimatedDots;
