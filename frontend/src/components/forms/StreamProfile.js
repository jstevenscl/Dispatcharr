// Modal.js
import React, { useEffect } from "react";
import {
  TextField,
  Button,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { useFormik } from "formik";
import * as Yup from "yup";
import API from "../../api";
import useUserAgentsStore from "../../store/userAgents";

const StreamProfile = ({ profile = null, isOpen, onClose }) => {
  const userAgents = useUserAgentsStore((state) => state.userAgents);

  const formik = useFormik({
    initialValues: {
      profile_name: "",
      command: "",
      parameters: "",
      is_active: true,
      user_agent: "",
    },
    validationSchema: Yup.object({
      profile_name: Yup.string().required("Name is required"),
      command: Yup.string().required("Command is required"),
      parameters: Yup.string().required("Parameters are is required"),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (profile?.id) {
        await API.updateStreamProfile({ id: profile.id, ...values });
      } else {
        await API.addStreamProfile(values);
      }

      resetForm();
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (profile) {
      formik.setValues({
        profile_name: profile.profile_name,
        command: profile.command,
        parameters: profile.parameters,
        is_active: profile.is_active,
        user_agent: profile.user_agent,
      });
    } else {
      formik.resetForm();
    }
  }, [profile]);

  if (!isOpen) {
    return <></>;
  }

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle
        sx={{
          backgroundColor: "primary.main",
          color: "primary.contrastText",
        }}
      >
        Stream Profile
      </DialogTitle>

      <form onSubmit={formik.handleSubmit}>
        <DialogContent>
          <TextField
            fullWidth
            id="profile_name"
            name="profile_name"
            label="Name"
            value={formik.values.profile_name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={
              formik.touched.profile_name && Boolean(formik.errors.profile_name)
            }
            helperText={
              formik.touched.profile_name && formik.errors.profile_name
            }
            variant="standard"
          />
          <TextField
            fullWidth
            id="command"
            name="command"
            label="Command"
            value={formik.values.command}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.command && Boolean(formik.errors.command)}
            helperText={formik.touched.command && formik.errors.command}
            variant="standard"
          />
          <TextField
            fullWidth
            id="parameters"
            name="parameters"
            label="Parameters"
            value={formik.values.parameters}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={
              formik.touched.parameters && Boolean(formik.errors.parameters)
            }
            helperText={formik.touched.parameters && formik.errors.parameters}
            variant="standard"
          />

          <FormControl variant="standard" fullWidth>
            <InputLabel id="channel-group-label">User-Agent</InputLabel>
            <Select
              labelId="channel-group-label"
              id="user_agent"
              name="user_agent"
              label="User-Agent"
              value={formik.values.user_agent}
              onChange={formik.handleChange}
              onBlur={formik.handleBlur}
              error={
                formik.touched.user_agent && Boolean(formik.errors.user_agent)
              }
              // helperText={formik.touched.user_agent && formik.errors.user_agent}
              variant="standard"
            >
              {userAgents.map((option, index) => (
                <MenuItem key={index} value={option.id}>
                  {option.user_agent_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>

        <DialogActions>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={formik.isSubmitting}
            size="small"
          >
            {formik.isSubmitting ? <CircularProgress size={24} /> : "Submit"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default StreamProfile;
