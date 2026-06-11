import React, { useState, useEffect, useRef } from 'react';

const SESSION_LIMIT = 10 * 60; // 10 minutes in seconds

const InactivityTimeout = ({ onLogout }) => {
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [timeRemaining, setTimeRemaining] = useState(SESSION_LIMIT);
  const countdownTimer = useRef(null);
  const sessionTimer = useRef(null);

  // Main session countdown — runs continuously from login, no reset on activity
  useEffect(() => {
    sessionTimer.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(sessionTimer.current);
          setShowModal(true);
          setCountdown(30);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (sessionTimer.current) clearInterval(sessionTimer.current); };
  }, []);

  // Modal countdown (30s to respond)
  useEffect(() => {
    if (showModal) {
      countdownTimer.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimer.current);
            onLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    }
    return () => { if (countdownTimer.current) clearInterval(countdownTimer.current); };
  }, [showModal, onLogout]);

  const handleYes = () => {
    setShowModal(false);
    setCountdown(30);
    setTimeRemaining(SESSION_LIMIT);
    // Restart session timer
    if (sessionTimer.current) clearInterval(sessionTimer.current);
    sessionTimer.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(sessionTimer.current);
          setShowModal(true);
          setCountdown(30);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleNo = () => {
    setShowModal(false);
    onLogout();
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isWarning = timeRemaining <= 120;
  const isCritical = timeRemaining <= 60;

  return (
    <>
      {/* Floating timer badge — always visible */}
      <div className={`fixed bottom-4 right-4 z-[999] flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-mono font-semibold transition-colors ${
        isCritical ? 'bg-red-600 text-white animate-pulse' :
        isWarning ? 'bg-amber-500 text-white' :
        'bg-gray-800 text-gray-200'
      }`}>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {formatTime(timeRemaining)}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">¿Sigues activo?</h2>
            <p className="text-gray-500 text-sm mb-1">Tu sesion de 10 minutos ha terminado.</p>
            <p className="text-amber-600 font-semibold text-lg mb-6">
              {countdown}s
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleNo}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                No
              </button>
              <button
                onClick={handleYes}
                className="flex-1 px-4 py-3 rounded-xl bg-blue-900 text-white font-medium hover:bg-blue-800 transition-colors"
              >
                Si
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InactivityTimeout;
