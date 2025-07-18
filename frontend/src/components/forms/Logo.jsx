import React, { useState, useEffect } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import {
    Modal,
    TextInput,
    Button,
    Group,
    Stack,
    Image,
    Text,
    Center,
    Box,
    Divider,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { Upload, FileImage, X } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import API from '../../api';

const LogoForm = ({ logo = null, isOpen, onClose }) => {
    const [logoPreview, setLogoPreview] = useState(null);
    const [uploading, setUploading] = useState(false);

    const formik = useFormik({
        initialValues: {
            name: '',
            url: '',
        },
        validationSchema: Yup.object({
            name: Yup.string().required('Name is required'),
            url: Yup.string()
                .required('URL is required')
                .test('valid-url-or-path', 'Must be a valid URL or local file path', (value) => {
                    if (!value) return false;
                    // Allow local file paths starting with /logos/
                    if (value.startsWith('/logos/')) return true;
                    // Allow valid URLs
                    try {
                        new URL(value);
                        return true;
                    } catch {
                        return false;
                    }
                }),
        }),
        onSubmit: async (values, { setSubmitting }) => {
            try {
                if (logo) {
                    await API.updateLogo(logo.id, values);
                    notifications.show({
                        title: 'Success',
                        message: 'Logo updated successfully',
                        color: 'green',
                    });
                } else {
                    await API.createLogo(values);
                    notifications.show({
                        title: 'Success',
                        message: 'Logo created successfully',
                        color: 'green',
                    });
                }
                onClose();
            } catch (error) {
                let errorMessage = logo ? 'Failed to update logo' : 'Failed to create logo';

                // Handle specific timeout errors
                if (error.code === 'NETWORK_ERROR' || error.message?.includes('timeout')) {
                    errorMessage = 'Request timed out. Please try again.';
                } else if (error.response?.data?.error) {
                    errorMessage = error.response.data.error;
                }

                notifications.show({
                    title: 'Error',
                    message: errorMessage,
                    color: 'red',
                });
            } finally {
                setSubmitting(false);
            }
        },
    });

    useEffect(() => {
        if (logo) {
            formik.setValues({
                name: logo.name || '',
                url: logo.url || '',
            });
            setLogoPreview(logo.cache_url);
        } else {
            formik.resetForm();
            setLogoPreview(null);
        }
    }, [logo, isOpen]);

    const handleFileUpload = async (files) => {
        if (files.length === 0) return;

        const file = files[0];

        // Validate file size on frontend first
        if (file.size > 5 * 1024 * 1024) { // 5MB
            notifications.show({
                title: 'Error',
                message: 'File too large. Maximum size is 5MB.',
                color: 'red',
            });
            return;
        }

        setUploading(true);

        try {
            const response = await API.uploadLogo(file);

            // Update form with uploaded file info
            formik.setFieldValue('name', response.name);
            formik.setFieldValue('url', response.url);
            setLogoPreview(response.cache_url);

            notifications.show({
                title: 'Success',
                message: 'Logo uploaded successfully',
                color: 'green',
            });
        } catch (error) {
            let errorMessage = 'Failed to upload logo';

            // Handle specific timeout errors
            if (error.code === 'NETWORK_ERROR' || error.message?.includes('timeout')) {
                errorMessage = 'Upload timed out. Please try again.';
            } else if (error.status === 413) {
                errorMessage = 'File too large. Please choose a smaller file.';
            } else if (error.body?.error) {
                errorMessage = error.body.error;
            }

            notifications.show({
                title: 'Error',
                message: errorMessage,
                color: 'red',
            });
        } finally {
            setUploading(false);
        }
    };

    const handleUrlChange = (event) => {
        const url = event.target.value;
        formik.setFieldValue('url', url);

        // Update preview for remote URLs
        if (url && url.startsWith('http')) {
            setLogoPreview(url);
        }
    };

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title={logo ? 'Edit Logo' : 'Add Logo'}
            size="md"
        >
            <form onSubmit={formik.handleSubmit}>
                <Stack spacing="md">
                    {/* Logo Preview */}
                    {logoPreview && (
                        <Center>
                            <Box>
                                <Text size="sm" color="dimmed" mb="xs" ta="center">
                                    Preview
                                </Text>
                                <Image
                                    src={logoPreview}
                                    alt="Logo preview"
                                    width={100}
                                    height={75}
                                    fit="contain"
                                    fallbackSrc="/logo.png"
                                    style={{
                                        transition: 'transform 0.3s ease',
                                        cursor: 'pointer',
                                        ':hover': {
                                            transform: 'scale(1.5)'
                                        }
                                    }}
                                    onMouseEnter={(e) => {
                                        e.target.style.transform = 'scale(1.5)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.target.style.transform = 'scale(1)';
                                    }}
                                />
                            </Box>
                        </Center>
                    )}

                    {/* File Upload */}
                    <Box>
                        <Text size="sm" fw={500} mb="xs">
                            Upload Logo File
                        </Text>
                        <Dropzone
                            onDrop={handleFileUpload}
                            accept={['image/png', 'image/jpeg', 'image/gif', 'image/webp']}
                            maxFiles={1}
                            loading={uploading}
                        >
                            <Group justify="center" gap="xl" mih={120} style={{ pointerEvents: 'none' }}>
                                <Dropzone.Accept>
                                    <Upload size={50} color="green" />
                                </Dropzone.Accept>
                                <Dropzone.Reject>
                                    <X size={50} color="red" />
                                </Dropzone.Reject>
                                <Dropzone.Idle>
                                    <FileImage size={50} />
                                </Dropzone.Idle>

                                <div>
                                    <Text size="xl" inline>
                                        Drag image here or click to select
                                    </Text>
                                    <Text size="sm" color="dimmed" inline mt={7}>
                                        Supports PNG, JPEG, GIF, WebP files
                                    </Text>
                                </div>
                            </Group>
                        </Dropzone>
                    </Box>

                    <Divider label="OR" labelPosition="center" />

                    {/* Manual URL Input */}
                    <TextInput
                        label="Logo URL"
                        placeholder="https://example.com/logo.png"
                        {...formik.getFieldProps('url')}
                        onChange={handleUrlChange}
                        error={formik.touched.url && formik.errors.url}
                    />

                    <TextInput
                        label="Name"
                        placeholder="Enter logo name"
                        {...formik.getFieldProps('name')}
                        error={formik.touched.name && formik.errors.name}
                    />

                    <Group justify="flex-end" mt="md">
                        <Button variant="light" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" loading={formik.isSubmitting || uploading}>
                            {logo ? 'Update' : 'Create'}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default LogoForm;
