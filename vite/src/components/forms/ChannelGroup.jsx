// Modal.js
import React, { useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import { Flex, TextInput, Button } from '@mantine/core';

const ChannelGroup = ({ channelGroup = null, isOpen, onClose }) => {
  const formik = useFormik({
    initialValues: {
      name: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
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
    <Modal opened={isOpen} onClose={onClose} title="Channel Group">
      <form onSubmit={formik.handleSubmit}>
        <TextInput
          id="name"
          name="name"
          label="Name"
          value={formik.values.name}
          onChange={formik.handleChange}
          error={formik.touched.name}
        />

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={formik.isSubmitting}
            size="small"
          >
            Submit
          </Button>
        </Flex>
      </form>
    </Modal>
  );
};

export default ChannelGroup;
