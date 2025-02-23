import React from 'react';
import { Link } from 'react-router-dom';

const HeaderBar = () => {
  return (
    <div class="container-fluid">
      <ul class="navbar-nav">
        <li class="nav-item">
          <a class="nav-link" data-lte-toggle="sidebar" href="#" role="button">
            <i class="bi bi-list"></i>
          </a>
        </li>
        {/* <li class="nav-item d-none d-md-block">
          <a href="{% url 'dashboard:dashboard' %}" class="nav-link">Home</a>
        </li> */}
      </ul>
      <ul class="navbar-nav ms-auto">
        <li class="nav-item">
          <Link to="/login" class="nav-link">Login</Link>
        </li>

        <li class="nav-item dropdown">
          <button class="btn btn-link nav-link py-2 px-0 px-lg-2 dropdown-toggle d-flex align-items-center"
            id="themeToggleBtn" type="button" aria-expanded="false"
            data-bs-toggle="dropdown" data-bs-display="static">
            <span class="theme-icon-active"><i class="bi bi-sun-fill my-1"></i></span>
            <span class="d-lg-none ms-2" id="theme-toggle-text">Toggle theme</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="themeToggleBtn">
            <li>
              <button type="button" class="dropdown-item d-flex align-items-center active" data-bs-theme-value="light">
                <i class="bi bi-sun-fill me-2"></i> Light
                <i class="bi bi-check-lg ms-auto d-none"></i>
              </button>
            </li>
            <li>
              <button type="button" class="dropdown-item d-flex align-items-center" data-bs-theme-value="dark">
                <i class="bi bi-moon-fill me-2"></i> Dark
                <i class="bi bi-check-lg ms-auto d-none"></i>
              </button>
            </li>
            <li>
              <button type="button" class="dropdown-item d-flex align-items-center" data-bs-theme-value="auto">
                <i class="bi bi-circle-half me-2"></i> Auto
                <i class="bi bi-check-lg ms-auto d-none"></i>
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  );
};

export default HeaderBar;
