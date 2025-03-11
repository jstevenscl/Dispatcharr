import React, { useState } from 'react';
import { Snackbar, Alert, Button } from '@mui/material';
import useAlertStore from '../store/alerts';

const AlertPopup = () => {
  const { open, message, severity, hideAlert } = useAlertStore();

  const handleClose = () => {
    hideAlert();
  };

  return (
    <Snackbar
      open={open}
      autoHideDuration={5000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      <Alert onClose={handleClose} severity={severity} sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  );
};

export default AlertPopup;
