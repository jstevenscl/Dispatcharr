import React from 'react';
import { Link } from 'react-router-dom';
import DescriptionIcon from '@mui/icons-material/Description';

const Sidebar = () => {
  return (
    <>
      <div class="sidebar-brand">
        <Link to="/daskboard" className="brand-link">
          <img src="/images/logo.png" alt="Dispatcharr Logo" class="brand-image opacity-75 shadow" />
          <span class="brand-text fw-light">Dispatcharr</span>
        </Link>
      </div>
      <div class="sidebar-wrapper">
        <nav class="mt-2">
          <ul class="nav sidebar-menu flex-column" data-lte-toggle="treeview" role="menu" data-accordion="false">
            <li class="nav-item">
              <Link to="/dashboard" className="nav-link">
                <i class="nav-icon bi bi-speedometer"></i>
                <p>Dashboard</p>
              </Link>
            </li>
            <li class="nav-item">
              <Link to="/channels" className="nav-link">
                <i class="nav-icon bi bi-tv"></i>
                <p>Channels</p>
              </Link>
            </li>
            <li class="nav-item">
              <Link to="/m3u" className="nav-link">
                <i class="nav-icon bi bi-file-earmark-text"></i>
                <p>M3U</p>
              </Link>
            </li>
            <li class="nav-item">
              <Link to="/epg" className="nav-link">
                <i class="nav-icon bi bi-calendar3"></i>
                <p>EPG</p>
              </Link>
            </li>
            <li class="nav-item">
              <Link to="/settings" className="nav-link">
                <i class="nav-icon bi bi-gear"></i>
                <p>Settings</p>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
