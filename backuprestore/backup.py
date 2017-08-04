import time
import json
from service_fabrik_backup_restore import parse_options, create_iaas_client


def main():
    # +-> Definition of constants
    DIRECTORY_PERSISTENT = '/var/vcap/store'
    DIRECTORY_SNAPSHOT = '/tmp/service-fabrik-backup/snapshot'
    DIRECTORY_UPLOADS = '/tmp/service-fabrik-backup/uploads'

    # +-> Initialization: Argument Parsing, IaaS-Client Creation
    configuration = parse_options('backup')
    iaas_client = create_iaas_client('backup', configuration, DIRECTORY_PERSISTENT, [DIRECTORY_SNAPSHOT, DIRECTORY_UPLOADS], 10 , 18000)

    # ------------------------------------------ BACKUP START ----------------------------------------------------------
    backup_guid = configuration['backup_guid']
    backup_type = configuration['type']
    instance_id = configuration['instance_id']
    landscape   = configuration['iaas'].title()
    iaas_client.initialize()

    try:
        tarball_files_name = 'blueprint-files.tar.gz.gpg'
        tarball_files_path = DIRECTORY_UPLOADS + '/' + tarball_files_name
        metadata_files_name = 'blueprint-metadata.json'
        metadata_files_path = '/tmp' + '/' + metadata_files_name

        # +-> Get the id of the persistent volume attached to this instance
        volume_persistent = iaas_client.get_persistent_volume_for_instance(instance_id)
        if not volume_persistent:
            iaas_client.exit('Could not find the persistent volume attached to this instance.')

        if backup_type == 'online':
            # +-> Create a snapshot of the persistent volume
            snapshot_store = iaas_client.create_snapshot(volume_persistent.id)
            if not snapshot_store:
                iaas_client.exit('Could not find the snapshot of the persistent volume {}.'
                                 .format(DIRECTORY_PERSISTENT))

            if landscape != 'Aws':
                # +-> Create a volume from this snapshot whose contents will be backed-up
                volume_snapshot = iaas_client.create_volume(snapshot_store.size, snapshot_store.id)
                if not volume_snapshot:
                    iaas_client.exit('Could not create a volume from the {} snapshot.'.format(DIRECTORY_PERSISTENT))

                # +-> Create a volume where the encrypted tarballs/files will be stored on (to be uploaded)
                volume_uploads = iaas_client.create_volume(snapshot_store.size)
                if not volume_uploads:
                    iaas_client.exit('Could not create a volume for the uploads.')

                # +-> Attach the snapshot volume to the instance
                attachment_volume_snapshot = iaas_client.create_attachment(volume_snapshot.id, instance_id)
                if not attachment_volume_snapshot:
                    iaas_client.exit('Could not attach the snapshot volume with id {} to instance with id {}.'
                                    .format(volume_snapshot.id, instance_id))

                # +-> Attach the upload volume to the instance
                attachment_volume_uploads = iaas_client.create_attachment(volume_uploads.id, instance_id)
                if not attachment_volume_uploads:
                    iaas_client.exit('Could not attach the upload volume with id {} to instance with id {}.'
                                    .format(volume_uploads.id, instance_id))

                # +-> Find the mountpoint of the snapshot volume
                mountpoint_volume_snapshot = iaas_client.get_mountpoint(volume_snapshot.id, '1')
                if not mountpoint_volume_snapshot:
                    iaas_client.exit('Could not determine the mountpoint for the snapshot volume (id: {}).'
                                    .format(volume_snapshot.id))

                # +-> Find the mountpoint of the upload volume
                mountpoint_volume_uploads = iaas_client.get_mountpoint(volume_uploads.id)
                if not mountpoint_volume_uploads:
                    iaas_client.exit('Could not determine the mountpoint for the upload volume (id: {}).'
                                    .format(volume_uploads.id))

                # +-> Create temporary directories, format the upload volume and mount them to these directories
                if not iaas_client.delete_directory(DIRECTORY_SNAPSHOT):
                    iaas_client.exit('Could not remove the following directory: {}.'.format(DIRECTORY_SNAPSHOT))
                if not iaas_client.delete_directory(DIRECTORY_UPLOADS):
                    iaas_client.exit('Could not remove the following directory: {}.'.format(DIRECTORY_UPLOADS))

                if not iaas_client.create_directory(DIRECTORY_SNAPSHOT):
                    iaas_client.exit('Could not create the following directory: {}'.format(DIRECTORY_SNAPSHOT))
                if not iaas_client.create_directory(DIRECTORY_UPLOADS):
                    iaas_client.exit('Could not create the following directory: {}'.format(DIRECTORY_UPLOADS))

                if not iaas_client.format_device(mountpoint_volume_uploads):
                    iaas_client.exit('Could not format the following device: {}'.format(mountpoint_volume_uploads))

                if not iaas_client.mount_device(mountpoint_volume_snapshot, DIRECTORY_SNAPSHOT):
                    iaas_client.exit('Could not mount the device {} to the directory {}.'
                                    .format(mountpoint_volume_snapshot, DIRECTORY_SNAPSHOT))
                if not iaas_client.mount_device(mountpoint_volume_uploads, DIRECTORY_UPLOADS):
                    iaas_client.exit('Could not mount the device {} to the directory {}.'
                                    .format(mountpoint_volume_uploads, DIRECTORY_UPLOADS))

                # +-> Create tarball of the contents of the persistent volume, encrypt it, and upload it to blob store
                # +-> Service Fabrik forces the services to store their blobs in a pseudo-folder named with the backup_guid
                if not iaas_client.create_and_encrypt_tarball_of_directory('{}/blueprint/files'
                                                                        .format(DIRECTORY_PERSISTENT),
                                                                        tarball_files_path):
                    iaas_client.exit('Could not create and encrypt a tarball of the directory {}'
                                    .format(DIRECTORY_PERSISTENT))
                if not iaas_client.upload_to_blobstore(tarball_files_path, '{}/{}'.format(backup_guid, tarball_files_name)):
                    iaas_client.exit('Could not upload the tarball {}.'.format(tarball_files_path))

                # +-> Unmount the volumes and remove the temporary directories
                if not iaas_client.unmount_device(mountpoint_volume_uploads):
                    iaas_client.exit('Could not unmount the device {}.'.format(mountpoint_volume_uploads))
                if not iaas_client.unmount_device(mountpoint_volume_snapshot):
                    iaas_client.exit('Could not unmount the device {}.'.format(mountpoint_volume_snapshot))

                if not iaas_client.delete_directory(DIRECTORY_SNAPSHOT):
                    iaas_client.exit('Could not remove the following directory: {}.'.format(DIRECTORY_SNAPSHOT))
                if not iaas_client.delete_directory(DIRECTORY_UPLOADS):
                    iaas_client.exit('Could not remove the following directory: {}.'.format(DIRECTORY_UPLOADS))

                # +-> Detach the snapshot volume and the upload volume from the instance
                if not iaas_client.delete_attachment(attachment_volume_uploads.volume_id, instance_id):
                    iaas_client.exit('Could not detach the upload volume with id {} to instance with id {}.'
                                    .format(attachment_volume_uploads.volume_id, instance_id))
                if not iaas_client.delete_attachment(attachment_volume_snapshot.volume_id, instance_id):
                    iaas_client.exit('Could not detach the snapshot with id {} to instance with id {}.'
                                    .format(attachment_volume_snapshot.volume_id, instance_id))

                # +-> Delete the upload volume and the snapshot volume
                if not iaas_client.delete_volume(volume_uploads.id):
                    iaas_client.exit('Could not delete the upload volume with id {}.'.format(volume_uploads.id))
                if not iaas_client.delete_volume(volume_snapshot.id):
                    iaas_client.exit('Could not delete the snapshot volume with id {}.'.format(volume_snapshot.id))

            if landscape == 'Aws':
                # +-> Copy Snapshot Function to encrypt the Snapshot
                snapshot_store_encrypted = iaas_client.copy_snapshot(snapshot_store.id)
                if not snapshot_store_encrypted:
                    iaas_client.exit('Could not create the encrypted copy of the snapshot {}.'
                                        .format(DIRECTORY_PERSISTENT))

                with open(metadata_files_path, 'w') as f:
                    f.write( json.dumps({ 'snapshotId': snapshot_store_encrypted.id }) )

                # +-> Keep agent metadata
                if not iaas_client.upload_to_blobstore(metadata_files_path, '{}/{}'.format(backup_guid, metadata_files_name)):
                    iaas_client.exit('Could not upload the tarball {}.'.format(metadata_files_path))

            # +-> Delete the snapshot of the persistent volume
            if not iaas_client.delete_snapshot(snapshot_store.id):
                iaas_client.exit('Could not delete the snapshot with id {}.'.format(snapshot_store.id))

        elif backup_type == 'offline':
            # +-> Stop the service job
            iaas_client.stop_service_job()

            # +-> Create a volume where the encrypted tarballs/files will be stored on (to be uploaded)
            volume_uploads = iaas_client.create_volume(volume_persistent.size)
            if not volume_uploads:
                iaas_client.exit('Could not create a volume for the uploads.')

            # +-> Attach the upload volume to the instance
            attachment_volume_uploads = iaas_client.create_attachment(volume_uploads.id, instance_id)
            if not attachment_volume_uploads:
                iaas_client.exit('Could not attach the upload volume with id {} to instance with id {}.'
                                 .format(volume_uploads.id, instance_id))

            # +-> Find the mountpoint of the upload volume
            mountpoint_volume_uploads = iaas_client.get_mountpoint(volume_uploads.id)
            if not mountpoint_volume_uploads:
                iaas_client.exit('Could not determine the mountpoint for the upload volume (id: {}).'
                                 .format(volume_uploads.id))

            # +-> Create temporary directory, format the upload volume and mount it to this directory
            if not iaas_client.delete_directory(DIRECTORY_UPLOADS):
                iaas_client.exit('Could not remove the following directory: {}.'.format(DIRECTORY_UPLOADS))
            if not iaas_client.create_directory(DIRECTORY_UPLOADS):
                iaas_client.exit('Could not create the following directory: {}'.format(DIRECTORY_UPLOADS))
            if not iaas_client.format_device(mountpoint_volume_uploads):
                iaas_client.exit('Could not format the following device: {}'.format(mountpoint_volume_uploads))
            if not iaas_client.mount_device(mountpoint_volume_uploads, DIRECTORY_UPLOADS):
                iaas_client.exit('Could not mount the device {} to the directory {}.'
                                 .format(mountpoint_volume_uploads, DIRECTORY_UPLOADS))

            # +-> Wait for the service job to be stopped before starting the content encryption
            if not iaas_client.wait_for_service_job_status('not monitored'):
                iaas_client.exit('Could not stop the service job.')

            # +-> Create tarball of the contents of the persistent volume and encrypt it
            if not iaas_client.create_and_encrypt_tarball_of_directory('{}/blueprint/files'
                                                                       .format(DIRECTORY_PERSISTENT),
                                                                       tarball_files_path):
                iaas_client.exit('Could not create and encrypt a tarball of the directory {}'
                                 .format(DIRECTORY_PERSISTENT))

            if landscape == 'Aws':
                # +-> Copy Snapshot Function to encrypt the Snapshot
                snapshot_store_encrypted = iaas_client.copy_snapshot(volume_persistent.id)
                if not snapshot_store_encrypted:
                    iaas_client.exit('Could not create the encrypted copy of the snapshot {}.'
                                        .format(DIRECTORY_PERSISTENT))

                with open(metadata_files_path, 'w') as f:
                    f.write( json.dumps({ 'snapshotId': snapshot_store_encrypted.id }) )

                # +-> Keep agent metadata
                if not iaas_client.upload_to_blobstore(metadata_files_path, '{}/{}'.format(backup_guid, metadata_files_name)):
                    iaas_client.exit('Could not upload the tarball {}.'.format(metadata_files_path))


            # +-> Start the service job
            iaas_client.start_service_job()

            # +-> Upload the tarball to the blob store
            if not iaas_client.upload_to_blobstore(tarball_files_path, '{}/{}'.format(backup_guid, tarball_files_name)):
                iaas_client.exit('Could not upload the tarball {}.'.format(tarball_files_path))

            # +-> Unmount the volumes and remove the temporary directories
            if not iaas_client.unmount_device(mountpoint_volume_uploads):
                iaas_client.exit('Could not unmount the device {}.'.format(mountpoint_volume_uploads))
            if not iaas_client.delete_directory(DIRECTORY_UPLOADS):
                iaas_client.exit('Could not remove the following directory: {}.'.format(DIRECTORY_UPLOADS))

            # +-> Detach the upload volume from the instance
            if not iaas_client.delete_attachment(attachment_volume_uploads.volume_id, instance_id):
                iaas_client.exit('Could not detach the upload volume with id {} to instance with id {}.'
                                 .format(attachment_volume_uploads.volume_id, instance_id))

            # +-> Delete the upload volume and the snapshot volume
            if not iaas_client.delete_volume(volume_uploads.id):
                iaas_client.exit('Could not delete the upload volume with id {}.'.format(volume_uploads.id))

            # +-> Wait for the service job to be running again
            if not iaas_client.wait_for_service_job_status('running'):
                iaas_client.exit('Could not get the service job to be running again.')

        iaas_client.finalize()
    except Exception as error:
        iaas_client.exit('An unexpected exception occurred: {}'.format(error))
    # ------------------------------------------- BACKUP END -----------------------------------------------------------


if __name__ == '__main__':
    main()
