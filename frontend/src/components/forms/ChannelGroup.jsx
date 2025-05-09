// Modal.js
import React from 'react';
import API from '../../api';
import { Flex, TextInput, Button, Modal } from '@mantine/core';
import { isNotEmpty, useForm } from '@mantine/form';

const ChannelGroup = ({ channelGroup = null, isOpen, onClose }) => {
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: {
      name: channelGroup ? channelGroup.name : '',
    },

    validate: {
      name: isNotEmpty('Specify a name'),
    },
  });

  const onSubmit = async () => {
    const values = form.getValues();
    let newGroup;

    if (channelGroup) {
      newGroup = await API.updateChannelGroup({ id: channelGroup.id, ...values });
    } else {
      newGroup = await API.addChannelGroup(values);
    }

    form.reset();
    onClose(newGroup); // Pass the new/updated group back to parent
  };

  if (!isOpen) {
    return <></>;
  }

  return (
    <Modal opened={isOpen} onClose={onClose} title="Channel Group">
      <form onSubmit={form.onSubmit(onSubmit)}>
        <TextInput
          id="name"
          name="name"
          label="Name"
          {...form.getInputProps('name')}
          key={form.key('name')}
        />

        <Flex mih={50} gap="xs" justify="flex-end" align="flex-end">
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={form.submitting}
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
