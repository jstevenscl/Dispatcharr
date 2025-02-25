// Modal.js
import React, { useEffect } from "react";
import {
  TextField,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { useFormik } from "formik";
import * as Yup from "yup";
import API from "../../api";

const ChannelGroup = ({ channelGroup = null, isOpen, onClose }) => {
  const formik = useFormik({
    initialValues: {
      name: "",
    },
    validationSchema: Yup.object({
      name: Yup.string().required("Name is required"),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (channelGroup?.id) {
        await API.updateChannelGroup({ id: channelGroup.id, ...values });
      } else {
        await API.addChannelGroup(values);
      }

      resetForm();
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (channelGroup) {
      formik.setValues({
        name: channelGroup.name,
      });
    } else {
      formik.resetForm();
    }
  }, [channelGroup]);

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
        Channel Group
      </DialogTitle>

      <form onSubmit={formik.handleSubmit}>
        <DialogContent>
          <TextField
            fullWidth
            id="name"
            name="name"
            label="Name"
            value={formik.values.name}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            error={formik.touched.name && Boolean(formik.errors.name)}
            helperText={formik.touched.name && formik.errors.name}
            variant="standard"
          />
        </DialogContent>
        <DialogActions>
          {/* Submit button */}
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

export default ChannelGroup;
