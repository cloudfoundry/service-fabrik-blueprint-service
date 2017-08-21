import time
import json
from service_fabrik_backup_restore import parse_options, create_iaas_client


def main():
    # +-> Definition of constants
    DIRECTORY_PERSISTENT = '/var/vcap/store'
    DIRECTORY_DOWNLOADS = '/tmp/service-fabrik-restore/downloads'

    # +-> Initialization: Logging, Argument Parsing, IaaS-Client Creation
    configuration = parse_options('restore')
    iaas_client = create_iaas_client(
        'restore', configuration, DIRECTORY_PERSISTENT, [DIRECTORY_DOWNLOADS])

    # ------------------------------------------ RESTORE START ---------------------------------------------------------
    backup_guid = configuration['backup_guid']
    instance_id = configuration['instance_id']
    iaas_client.initialize()

    try:
        tarball_files_name = 'blueprint-files.tar.gz.gpg'
        tarball_files_path = DIRECTORY_DOWNLOADS + '/' + tarball_files_name
        metadata_files_name = 'blueprint-metadata.json'
        metadata_files_path = '/tmp/' + metadata_files_name

        # +-> Get the id of the persistent volume attached to this instance
        volume_persistent = iaas_client.get_persistent_volume_for_instance(
            instance_id)
        if not volume_persistent:
            iaas_client.exit(
                'Could not find the persistent volume attached to this instance.')

        # get sanpshot id from service metadata stored in blobstore
        if not iaas_client.download_from_blobstore('{}/{}'.format(backup_guid, metadata_files_name), metadata_files_path):
            iaas_client.exit(
                'Could not download the tarball {} for backup guid {} from pseudo-folder.'.format(metadata_files_name, backup_guid))
        encrypted_snapshot_id = str(
            json.load(open(metadata_files_path))['snapshotId'])

        if encrypted_snapshot_id is None:
            # +-> Create a volume where the downloaded blobs will be stored on
            volume_downloads = iaas_client.create_volume(
                volume_persistent.size)
            if not volume_downloads:
                iaas_client.exit(
                    'Could not create a volume for the downloads.')

            # +-> Attach the download volume to the instance
            attachment_volume_downloads = iaas_client.create_attachment(
                volume_downloads.id, instance_id)
            if not attachment_volume_downloads:
                iaas_client.exit('Could not attach the download volume with id {} to instance with id {}.'
                                 .format(volume_downloads.id, instance_id))

            # +-> Find the mountpoint of the download volume
            mountpoint_volume_downloads = iaas_client.get_mountpoint(
                volume_downloads.id)
            if not mountpoint_volume_downloads:
                iaas_client.exit('Could not determine the mountpoint for the download volume (id: {}).'
                                 .format(volume_downloads.id))

            # +-> Create temporary directories, format the download volume and mount them to these directories
            if not iaas_client.delete_directory(DIRECTORY_DOWNLOADS):
                iaas_client.exit(
                    'Could not remove the following directory: {}.'.format(DIRECTORY_DOWNLOADS))
            if not iaas_client.create_directory(DIRECTORY_DOWNLOADS):
                iaas_client.exit(
                    'Could not create the following directory: {}'.format(DIRECTORY_DOWNLOADS))
            if not iaas_client.format_device(mountpoint_volume_downloads):
                iaas_client.exit('Could not format the following device: {}'.format(
                    mountpoint_volume_downloads))
            if not iaas_client.mount_device(mountpoint_volume_downloads, DIRECTORY_DOWNLOADS):
                iaas_client.exit('Could not mount the device {} to the directory {}.'
                                 .format(mountpoint_volume_downloads, DIRECTORY_DOWNLOADS))

            # +-> Download tarball from the blob store and decrypt it
            # +-> Service Fabrik forces the services to store their blobs in a pseudo-folder named with the backup_guid,
            #     thus we download our files from that pseudo-folder
            if not iaas_client.download_from_blobstore('{}/{}'.format(backup_guid, tarball_files_name), tarball_files_path):
                iaas_client.exit(
                    'Could not download the tarball {} for backup guid {} from pseudo-folder.'.format(tarball_files_name, backup_guid))

            # +-> Stop the service job and wait for it to be stopped
            iaas_client.stop_service_job()
            if not iaas_client.wait_for_service_job_status('not monitored'):
                iaas_client.exit('Could not stop the service job.')

            # +-> Extract the tarball's contents to the persistent volume
            if not iaas_client.decrypt_and_extract_tarball_of_directory(tarball_files_path,
                                                                        '{}/blueprint/files'.format(DIRECTORY_PERSISTENT)):
                iaas_client.exit('Could not decrypt and extract the tarball {} to the persistent volume.'
                                 .format(tarball_files_path))

            # +-> Start the service job
            iaas_client.start_service_job()

            # +-> Unmount the volumes and remove the temporary directories
            if not iaas_client.unmount_device(mountpoint_volume_downloads):
                iaas_client.exit('Could not unmount the device {}.'.format(
                    mountpoint_volume_downloads))
            if not iaas_client.delete_directory(DIRECTORY_DOWNLOADS):
                iaas_client.exit(
                    'Could not remove the following directory: {}.'.format(DIRECTORY_DOWNLOADS))

            # +-> Detach the download volume from the instance
            if not iaas_client.delete_attachment(attachment_volume_downloads.volume_id, instance_id):
                iaas_client.exit('Could not detach the download volume with id {} to instance with id {}.'
                                 .format(attachment_volume_downloads.volume_id, instance_id))

            # +-> Delete the download volume and the snapshot volume
            if not iaas_client.delete_volume(volume_downloads.id):
                iaas_client.exit(
                    'Could not delete the download volume with id {}.'.format(volume_downloads.id))

        if encrypted_snapshot_id is not None:
            # +-> Create a volume where the downloaded blobs will be stored on
            snapshot_volume = iaas_client.create_volume(
                volume_persistent.size, encrypted_snapshot_id)
            if not snapshot_volume:
                iaas_client.exit(
                    'Could not create a volume for the downloads.')

            # +-> Attach the encrypted backup volume to the instance
            attachment_encrypted_snapshot = iaas_client.create_attachment(
                snapshot_volume.id, instance_id)
            if not attachment_encrypted_snapshot:
                iaas_client.exit('Could not attach the download volume with id {} to instance with id {}.'
                                 .format(snapshot_volume.id, instance_id))

            # +-> Find the mountpoint of the encrypted backup volume
            mountpoint_encrypted_snapshot = iaas_client.get_mountpoint(
                snapshot_volume.id, '1')
            if not mountpoint_encrypted_snapshot:
                iaas_client.exit('Could not determine the mountpoint for the download volume (id: {}).'
                                 .format(encrypted_snapshot_id))

            # +-> Create temporary directories, mount the encrypted volume to this directory
            if not iaas_client.delete_directory(DIRECTORY_DOWNLOADS):
                iaas_client.exit(
                    'Could not remove the following directory: {}.'.format(DIRECTORY_DOWNLOADS))
            if not iaas_client.create_directory(DIRECTORY_DOWNLOADS):
                iaas_client.exit(
                    'Could not create the following directory: {}'.format(DIRECTORY_DOWNLOADS))

            if not iaas_client.mount_device(mountpoint_encrypted_snapshot, DIRECTORY_DOWNLOADS):
                iaas_client.exit('Could not mount the device {} to the directory {}.'
                                 .format(mountpoint_encrypted_snapshot, DIRECTORY_DOWNLOADS))

            iaas_client.stop_service_job()
            if not iaas_client.wait_for_service_job_status('not monitored'):
                iaas_client.exit('Could not stop the service job.')

            # +-> Delete the original contents of the persistant volume
            if not iaas_client.delete_directory('{}/blueprint/files/*'.format(DIRECTORY_PERSISTENT)):
                iaas_client.exit('Could not remove the following directory: {}.'.format(
                    '{}/blueprint/files'.format(DIRECTORY_PERSISTENT)))
            if not iaas_client.create_directory('{}/blueprint/files'.format(DIRECTORY_PERSISTENT)):
                iaas_client.exit('Could not create the following directory: {}'.format(
                    '{}/blueprint/files'.format(DIRECTORY_PERSISTENT)))
            # +-> Copy the Encrypted backups contents to the persistent volume
            if not iaas_client.copy_directory(
                    '{}/blueprint/files/*'.format(DIRECTORY_DOWNLOADS),
                    '{}/blueprint/files'.format(DIRECTORY_PERSISTENT)):
                iaas_client.exit('Could not copy from {}/{} to the persistent volume.'
                                 .format(DIRECTORY_DOWNLOADS, DIRECTORY_PERSISTENT))

            # +-> Start the service job
            iaas_client.start_service_job()

            # +-> Unmount the volumes and remove the temporary directories
            if not iaas_client.unmount_device(mountpoint_encrypted_snapshot):
                iaas_client.exit('Could not unmount the device {}.'.format(
                    mountpoint_encrypted_snapshot))
            if not iaas_client.delete_directory(DIRECTORY_DOWNLOADS):
                iaas_client.exit(
                    'Could not remove the following directory: {}.'.format(DIRECTORY_DOWNLOADS))

            # +-> Detach the download volume from the instance
            if not iaas_client.delete_attachment(attachment_encrypted_snapshot.volume_id, instance_id):
                iaas_client.exit('Could not detach the download volume with id {} to instance with id {}.'
                                 .format(attachment_encrypted_snapshot.volume_id, instance_id))

            if not iaas_client.delete_volume(snapshot_volume.id):
                iaas_client.exit(
                    'Could not delete the download volume with id {}.'.format(snapshot_volume.id))

        # +-> Wait for the service job to be running again
        if not iaas_client.wait_for_service_job_status('running'):
            iaas_client.exit('Could not start the service job.')

        iaas_client.finalize()
    except Exception as error:
        iaas_client.exit('An unexpected exception occurred: {}'.format(error))
    # ------------------------------------------- RESTORE END ----------------------------------------------------------


if __name__ == '__main__':
    main()
