/**
 * MobileNav Component
 * Mobile navigation with hamburger menu and slide-in drawer
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu,
  X,
  Home,
  DollarSign,
  FileText,
  Settings,
  LogOut,
  User,
  Shield,
} from 'lucide-react';
import { useAuthStore } from '@/store/appStore';

interface NavLink {
  to: string;
  label: string;
  icon: React.ReactNode;
  requireAuth?: boolean;
}

const navLinks: NavLink[] = [
  { to: '/', label: 'Home', icon: <Home size={20} /> },
  { to: '/pricing', label: 'Pricing', icon: <DollarSign size={20} /> },
  { to: '/docs', label: 'API Docs', icon: <FileText size={20} /> },
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: <Shield size={20} />,
    requireAuth: true,
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: <Settings size={20} />,
    requireAuth: true,
  },
];

export const MobileNav: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();

  // Close drawer when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  const visibleLinks = navLinks.filter(
    (link) => !link.requireAuth || isAuthenticated
  );

  return (
    <>
      <nav className="mobile-nav">
        <Link to="/" className="mobile-nav-brand">
          Kamiyo
        </Link>

        <button
          className="mobile-nav-toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle navigation"
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mobile-nav-overlay open"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <motion.div
        className={`mobile-nav-drawer ${isOpen ? 'open' : ''}`}
        initial={false}
        animate={{
          x: isOpen ? 0 : -320,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
      >
        {/* User Info */}
        {isAuthenticated && user && (
          <div className="mobile-nav-user">
            <div className="user-avatar">
              <User size={32} />
            </div>
            <div className="user-info">
              <p className="user-name">{user.name || user.email}</p>
              <p className="user-tier">{user.tier} Plan</p>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <ul className="mobile-nav-links">
          {visibleLinks.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className={`mobile-nav-link ${
                  location.pathname === link.to ? 'active' : ''
                }`}
              >
                <span className="nav-icon">{link.icon}</span>
                <span className="nav-label">{link.label}</span>
              </Link>
            </li>
          ))}

          {isAuthenticated ? (
            <li>
              <button onClick={handleLogout} className="mobile-nav-link">
                <span className="nav-icon">
                  <LogOut size={20} />
                </span>
                <span className="nav-label">Logout</span>
              </button>
            </li>
          ) : (
            <>
              <li>
                <Link to="/login" className="mobile-nav-link">
                  <span className="nav-icon">
                    <User size={20} />
                  </span>
                  <span className="nav-label">Login</span>
                </Link>
              </li>
              <li>
                <Link to="/signup" className="mobile-nav-link button-primary">
                  <span className="nav-label">Sign Up</span>
                </Link>
              </li>
            </>
          )}
        </ul>
      </motion.div>
    </>
  );
};

export default MobileNav;
