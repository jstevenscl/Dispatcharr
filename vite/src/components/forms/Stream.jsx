// Modal.js
import React, { useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import useStreamProfilesStore from '../../store/streamProfiles';
import { TextInput, Select, Button } from '@mantine/core';

const Stream = ({ stream = null, isOpen, onClose }) => {
  const streamProfiles = useStreamProfilesStore((state) => state.profiles);

  const formik = useFormik({
    initialValues: {
      name: '',
      url: '',
      stream_profile_id: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      url: Yup.string().required('URL is required').min(0),
      // stream_profile_id: Yup.string().required('Stream profile is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (stream?.id) {
        await API.updateStream({ id: stream.id, ...values });
      } else {
        await API.addStream(values);
      }

      resetForm();
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (stream) {
      formik.setValues({
        name: stream.name,
        url: stream.url,
        stream_profile_id: stream.stream_profile_id,
      });
    } else {
      formik.resetForm();
    }
  }, [stream]);

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title="Stream">
      <form onSubmit={formik.handleSubmit}>
        <TextInput
          id="name"
          name="name"
          label="Stream Name"
          value={formik.values.name}
          onChange={formik.handleChange}
          error={formik.touched.name && Boolean(formik.errors.name)}
        />

        <TextInput
          id="url"
          name="url"
          label="Stream URL"
          value={formik.values.url}
          onChange={formik.handleChange}
          error={formik.touched.url && Boolean(formik.errors.url)}
        />

        <Select
          id="stream_profile_id"
          name="stream_profile_id"
          label="Stream Profile (optional)"
          value={formik.values.stream_profile_id}
          onChange={formik.handleChange}
          error={
            formik.errors.stream_profile_id
              ? formik.touched.stream_profile_id
              : ''
          }
          data={streamProfiles.map((profile) => ({
            label: profile.profile_name,
            value: `${profile.id}`,
          }))}
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={formik.isSubmitting}
        >
          {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
        </Button>
      </form>
    </Modal>
  );
};

export default Stream;
