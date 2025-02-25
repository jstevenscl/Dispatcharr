// Modal.js
import React, { useState, useEffect } from "react";
import { Box, Modal, Typography, Stack, TextField, Button, Select, MenuItem, Grid2, InputLabel, FormControl, CircularProgress, Checkbox } from "@mui/material";
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from "../../api"

const UserAgent = ({ userAgent = null, isOpen, onClose }) => {
  const formik = useFormik({
    initialValues: {
      user_agent_name: '',
      user_agent: '',
      description: '',
      is_active: true,
    },
    validationSchema: Yup.object({
      user_agent_name: Yup.string().required('Name is required'),
      user_agent: Yup.string().required('User-Agent is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (userAgent?.id) {
        await API.updateUserAgent({id: userAgent.id, ...values})
      } else {
        await API.addUserAgent(values)
      }

      resetForm();
      setSubmitting(false);
      onClose()
    }
  })

  useEffect(() => {
    if (userAgent) {
      formik.setValues({
        user_agent_name: userAgent.user_agent_name,
        user_agent: userAgent.user_agent,
        description: userAgent.description,
        is_active: userAgent.is_active,
      });
    } else {
      formik.resetForm();
    }
  }, [userAgent]);

  if (!isOpen) {
    return <></>
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
    >
      <Box sx={style}>
        <Typography id="form-modal-title" variant="h6" mb={2}>
          User-Agent
        </Typography>

        <form onSubmit={formik.handleSubmit}>
          <TextField
            fullWidth
            id="user_agent_name"
            name="user_agent_name"
            label="Name"
            value={formik.values.user_agent_name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.user_agent_name && Boolean(formik.errors.user_agent_name)}
            helperText={formik.touched.user_agent_name && formik.errors.user_agent_name}
            variant="standard"
          />

          <TextField
            fullWidth
            id="user_agent"
            name="user_agent"
            label="User-Agent"
            value={formik.values.user_agent}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.user_agent && Boolean(formik.errors.user_agent)}
            helperText={formik.touched.user_agent && formik.errors.user_agent}
            variant="standard"
          />

          <TextField
            fullWidth
            id="description"
            name="description"
            label="Description"
            value={formik.values.description}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.description && Boolean(formik.errors.description)}
            helperText={formik.touched.description && formik.errors.description}
            variant="standard"
          />

          <Checkbox
            name="is_active"
            checked={formik.values.is_active}
            onChange={formik.handleChange}
          />
          <Box mb={2}>
            {/* Submit button */}
            <Button
              size="small"
              type="submit"
              variant="contained"
              color="primary"
              disabled={formik.isSubmitting}
              fullWidth
            >
              {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
            </Button>
          </Box>
        </form>
      </Box>
    </Modal>
  );
};

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 400,
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
};

export default UserAgent;
