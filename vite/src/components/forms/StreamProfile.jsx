// Modal.js
import React, { useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import useUserAgentsStore from '../../store/userAgents';
import { Modal, TextInput, Select, Button } from '@mantine/core';

const StreamProfile = ({ profile = null, isOpen, onClose }) => {
  const userAgents = useUserAgentsStore((state) => state.userAgents);

  const formik = useFormik({
    initialValues: {
      profile_name: '',
      command: '',
      parameters: '',
      is_active: true,
      user_agent: '',
    },
    validationSchema: Yup.object({
      profile_name: Yup.string().required('Name is required'),
      command: Yup.string().required('Command is required'),
      parameters: Yup.string().required('Parameters are is required'),
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
    <Modal open={isOpen} onClose={onClose} title="Stream Profile">
      <form onSubmit={formik.handleSubmit}>
        <TextInput
          id="profile_name"
          name="profile_name"
          label="Name"
          value={formik.values.profile_name}
          onChange={formik.handleChange}
          error={formik.touched.profile_name}
        />
        <TextInput
          id="command"
          name="command"
          label="Command"
          value={formik.values.command}
          onChange={formik.handleChange}
          error={formik.touched.command}
        />
        <TextInput
          id="parameters"
          name="parameters"
          label="Parameters"
          value={formik.values.parameters}
          onChange={formik.handleChange}
          error={formik.touched.parameters}
        />

        <Select
          id="user_agent"
          name="user_agent"
          label="User-Agent"
          value={formik.values.user_agent}
          onChange={formik.handleChange}
          error={formik.touched.user_agent}
          data={userAgents.map((ua) => ({
            label: ua.user_agent_name,
            value: `${ua.id}`,
          }))}
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          disabled={formik.isSubmitting}
          size="small"
        >
          Submit
        </Button>
      </form>
    </Modal>
  );
};

export default StreamProfile;
