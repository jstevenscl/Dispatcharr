// Modal.js
import React, { useEffect, useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import useStreamProfilesStore from '../../store/streamProfiles';
import { Modal, TextInput, Select, Button, Flex } from '@mantine/core';

const Stream = ({ stream = null, isOpen, onClose }) => {
  const streamProfiles = useStreamProfilesStore((state) => state.profiles);
  const [selectedStreamProfile, setSelectedStreamProfile] = useState('');

  const formik = useFormik({
    initialValues: {
      name: '',
      url: '',
      group_name: '',
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
        group_name: stream.group_name,
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
    <Modal opened={isOpen} onClose={onClose} title="Stream" zIndex={10}>
      <form onSubmit={formik.handleSubmit}>
        <TextInput
          id="name"
          name="name"
          label="Stream Name"
          value={formik.values.name}
          onChange={formik.handleChange}
          error={formik.errors.name}
        />

        <TextInput
          id="url"
          name="url"
          label="Stream URL"
          value={formik.values.url}
          onChange={formik.handleChange}
          error={formik.errors.url}
        />

        <TextInput
          id="group_name"
          name="group_name"
          label="Group"
          value={formik.values.group_name}
          onChange={formik.handleChange}
          error={formik.errors.group_name}
        />

        <Select
          id="stream_profile_id"
          name="stream_profile_id"
          label="Stream Profile"
          placeholder="Optional"
          value={selectedStreamProfile}
          onChange={setSelectedStreamProfile}
          error={formik.errors.stream_profile_id}
          data={streamProfiles.map((profile) => ({
            label: profile.profile_name,
            value: `${profile.id}`,
          }))}
          comboboxProps={{ withinPortal: false, zIndex: 1000 }}
        />

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={formik.isSubmitting}
          >
            {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
          </Button>
        </Flex>
      </form>
    </Modal>
  );
};

export default Stream;
