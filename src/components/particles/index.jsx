import { useEffect, useRef } from 'react';

export const ParticlesBackground = () => {
    const containerRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        for (let i = 0; i < 50; i++) {
            const size = Math.random() * 35 + 5;
            const particle = document.createElement('div');
            particle.className = 'absolute rounded-full bg-white/10 animate-float';

            Object.assign(particle.style, {
                width: `${size}px`,
                height: `${size}px`,
                left: `${Math.random() * 100}%`,
                bottom: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
            });

            container.appendChild(particle);
        }

        return () => {
            if (container) {
                container.innerHTML = '';
            }
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 -z-10 bg-gradient-to-tr from-[#1a237e] via-[#0277bd] to-[#00838f] bg-gradient-size animate-gradient"
        />
    );
};

