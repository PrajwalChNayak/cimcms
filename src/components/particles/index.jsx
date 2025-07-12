import { useEffect, useRef } from 'react';

export const ParticlesBackground = () => {
    const containerRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Detect screen size for responsive particle count
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;

        // Adjust particle counts based on screen size
        const particleCount = isMobile ? 15 : isTablet ? 20 : 30;
        const sensorCount = isMobile ? 4 : isTablet ? 6 : 8;
        const dataFlowCount = isMobile ? 2 : isTablet ? 3 : 5;
        const networkCount = isMobile ? 6 : isTablet ? 8 : 12;
        const packetCount = isMobile ? 3 : isTablet ? 4 : 6;

        // Create floating particles
        for (let i = 0; i < particleCount; i++) {
            const size = Math.random() * 15 + 2; // Smaller particles on mobile
            const particle = document.createElement('div');
            particle.className = 'absolute rounded-full bg-white/5 animate-float';

            Object.assign(particle.style, {
                width: `${size}px`,
                height: `${size}px`,
                left: `${Math.random() * 100}%`,
                bottom: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${Math.random() * 10 + 10}s`,
            });

            container.appendChild(particle);
        }

        // Create sensor nodes - only on larger screens
        if (!isMobile) {
            for (let i = 0; i < sensorCount; i++) {
                const node = document.createElement('div');
                node.className = 'absolute animate-pulse';

                const colors = ['cyan', 'green', 'blue', 'purple'];
                const color = colors[i % colors.length];

                Object.assign(node.style, {
                    width: '4px',
                    height: '4px',
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    backgroundColor: `rgb(34, 211, 238)`, // cyan-400
                    borderRadius: '50%',
                    boxShadow: `0 0 8px rgb(34, 211, 238)`,
                    animationDelay: `${Math.random() * 2}s`,
                });

                container.appendChild(node);
            }
        }

        // Create data flow lines - only on larger screens
        if (!isMobile) {
            for (let i = 0; i < dataFlowCount; i++) {
                const line = document.createElement('div');
                line.className = 'absolute h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse';

                Object.assign(line.style, {
                    width: `${Math.random() * 150 + 80}px`, // Shorter lines on smaller screens
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    transform: `rotate(${Math.random() * 360}deg)`,
                    animationDelay: `${Math.random() * 3}s`,
                    animationDuration: `${Math.random() * 4 + 2}s`,
                });

                container.appendChild(line);
            }
        }

        // Create network connection dots - reduced on mobile
        for (let i = 0; i < networkCount; i++) {
            const dot = document.createElement('div');
            dot.className = 'absolute rounded-full bg-white/20 animate-ping';

            Object.assign(dot.style, {
                width: '3px',
                height: '3px',
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 4}s`,
                animationDuration: '3s',
            });

            container.appendChild(dot);
        }

        // Create floating data packets - only on larger screens
        if (!isMobile) {
            for (let i = 0; i < packetCount; i++) {
                const packet = document.createElement('div');
                packet.className = 'absolute animate-bounce';

                Object.assign(packet.style, {
                    width: '6px',
                    height: '6px',
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    backgroundColor: 'rgb(34, 197, 94)', // green-500
                    borderRadius: '2px',
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: '2s',
                });

                container.appendChild(packet);
            }
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
            className="fixed inset-0 -z-10 bg-gradient-to-tr from-slate-900 via-blue-900/50 to-cyan-900/30"
        />
    );
};

