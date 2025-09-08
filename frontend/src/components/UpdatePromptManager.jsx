import React from 'react';
import UpdateIgnoreDialog from './UpdateIgnoreDialog';
import useUpdatePromptStore from '../store/updatePrompt';
import useNotificationsStore from '../store/notifications';

const UpdatePromptManager = () => {
  const { open, version, url, close } = useUpdatePromptStore();
  const notifStore = useNotificationsStore();

  const onChoice = async (choice) => {
    try {
      if (choice === 'later') {
        notifStore.setLastShownNow();
        await notifStore.save();
      } else if (choice === 'ignore_version') {
        notifStore.addIgnoredVersion(version);
        notifStore.setLastShownNow();
        await notifStore.save();
      } else if (choice === 'never') {
        notifStore.setUpdatePolicy('never');
        await notifStore.save();
      }
    } catch (e) {
      // non-fatal
    } finally {
      close();
    }
  };

  return (
    <UpdateIgnoreDialog
      opened={open}
      version={version}
      url={url}
      onClose={close}
      onChoice={onChoice}
    />
  );
};

export default UpdatePromptManager;
