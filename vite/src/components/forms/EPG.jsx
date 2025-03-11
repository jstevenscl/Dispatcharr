// Modal.js
import React, { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import useEPGsStore from '../../store/epgs';
import {
  LoadingOverlay,
  TextInput,
  Button,
  Checkbox,
  Modal,
  Flex,
  NativeSelect,
  FileInput,
  Space,
} from '@mantine/core';

const EPG = ({ epg = null, isOpen, onClose }) => {
  const epgs = useEPGsStore((state) => state.epgs);
  const [file, setFile] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFile(file);
    }
  };

  const formik = useFormik({
    initialValues: {
      name: '',
      source_type: 'xmltv',
      url: '',
      api_key: '',
      is_active: true,
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      source_type: Yup.string().required('Source type is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      if (epg?.id) {
        await API.updateEPG({ id: epg.id, ...values, epg_file: file });
      } else {
        await API.addEPG({
          ...values,
          epg_file: file,
        });
      }

      resetForm();
      setFile(null);
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (epg) {
      formik.setValues({
        name: epg.name,
        source_type: epg.source_type,
        url: epg.url,
        api_key: epg.api_key,
        is_active: epg.is_active,
      });
    } else {
      formik.resetForm();
    }
  }, [epg]);

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title="EPG Source">
      <form onSubmit={formik.handleSubmit}>
        <TextInput
          id="name"
          name="name"
          label="Name"
          value={formik.values.name}
          onChange={formik.handleChange}
          error={formik.touched.name && Boolean(formik.errors.name)}
        />

        <TextInput
          id="url"
          name="url"
          label="URL"
          value={formik.values.url}
          onChange={formik.handleChange}
          error={formik.touched.url && Boolean(formik.errors.url)}
        />

        <TextInput
          id="api_key"
          name="api_key"
          label="API Key"
          value={formik.values.api_key}
          onChange={formik.handleChange}
          error={formik.touched.api_key && Boolean(formik.errors.api_key)}
        />

        <NativeSelect
          id="source_type"
          name="source_type"
          label="Source Type"
          value={formik.values.source_type}
          onChange={formik.handleChange}
          error={
            formik.touched.source_type && Boolean(formik.errors.source_type)
          }
          data={[
            {
              label: 'XMLTV',
              valeu: 'xmltv',
            },
            {
              label: 'Schedules Direct',
              valeu: 'schedules_direct',
            },
          ]}
        />

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button
            type="submit"
            variant="contained"
            disabled={formik.isSubmitting}
            size="small"
          >
            {formik.isSubmitting ? <CircularProgress size={24} /> : 'Submit'}
          </Button>
        </Flex>
      </form>
    </Modal>
  );
};

export default EPG;
