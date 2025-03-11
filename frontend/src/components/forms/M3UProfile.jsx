import React, { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import API from '../../api';
import {
  Flex,
  Modal,
  TextInput,
  Button,
  Title,
  Text,
  Paper,
} from '@mantine/core';

const RegexFormAndView = ({ profile = null, m3u, isOpen, onClose }) => {
  const [searchPattern, setSearchPattern] = useState('');
  const [replacePattern, setReplacePattern] = useState('');

  let regex;
  try {
    regex = new RegExp(searchPattern, 'g');
  } catch (e) {
    regex = null;
  }

  const highlightedUrl = regex
    ? m3u.server_url.replace(regex, (match) => `<mark>${match}</mark>`)
    : m3u.server_url;

  const resultUrl =
    regex && replacePattern
      ? m3u.server_url.replace(regex, replacePattern)
      : m3u.server_url;

  const onSearchPatternUpdate = (e) => {
    formik.handleChange(e);
    setSearchPattern(e.target.value);
  };

  const onReplacePatternUpdate = (e) => {
    formik.handleChange(e);
    setReplacePattern(e.target.value);
  };

  const formik = useFormik({
    initialValues: {
      name: '',
      max_streams: 0,
      search_pattern: '',
      replace_pattern: '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      search_pattern: Yup.string().required('Search pattern is required'),
      replace_pattern: Yup.string().required('Replace pattern is required'),
    }),
    onSubmit: async (values, { setSubmitting, resetForm }) => {
      console.log('submiting');
      if (profile?.id) {
        await API.updateM3UProfile(m3u.id, {
          id: profile.id,
          ...values,
        });
      } else {
        await API.addM3UProfile(m3u.id, values);
      }

      resetForm();
      setSubmitting(false);
      onClose();
    },
  });

  useEffect(() => {
    if (profile) {
      setSearchPattern(profile.search_pattern);
      setReplacePattern(profile.replace_pattern);
      formik.setValues({
        name: profile.name,
        max_streams: profile.max_streams,
        search_pattern: profile.search_pattern,
        replace_pattern: profile.replace_pattern,
      });
    } else {
      formik.resetForm();
    }
  }, [profile]);

  return (
    <Modal opened={isOpen} onClose={onClose} title="M3U Profile">
      <form onSubmit={formik.handleSubmit}>
        <TextInput
          id="name"
          name="name"
          label="Name"
          value={formik.values.name}
          onChange={formik.handleChange}
          error={formik.errors.name ? formik.touched.name : ''}
        />
        <TextInput
          id="max_streams"
          name="max_streams"
          label="Max Streams"
          value={formik.values.max_streams}
          onChange={formik.handleChange}
          error={formik.errors.max_streams ? formik.touched.max_streams : ''}
        />
        <TextInput
          id="search_pattern"
          name="search_pattern"
          label="Search Pattern (Regex)"
          value={searchPattern}
          onChange={onSearchPatternUpdate}
          error={
            formik.errors.search_pattern ? formik.touched.search_pattern : ''
          }
        />
        <TextInput
          id="replace_pattern"
          name="replace_pattern"
          label="Replace Pattern"
          value={replacePattern}
          onChange={onReplacePatternUpdate}
          error={
            formik.errors.replace_pattern ? formik.touched.replace_pattern : ''
          }
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

      <Paper shadow="sm" p="md" radius="md" withBorder>
        <Text>Search</Text>
        <Text
          dangerouslySetInnerHTML={{ __html: highlightedUrl }}
          sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        />
      </Paper>

      <Paper p="md" withBorder>
        <Text>Replace</Text>
        <Text>{resultUrl}</Text>
      </Paper>
    </Modal>
  );
};

export default RegexFormAndView;
