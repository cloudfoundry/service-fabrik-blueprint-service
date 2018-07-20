import time
import json
from service_fabrik_backup_restore import parse_options, create_iaas_client


def main():
    # +-> Definition of constants
    # these locations are given for reference purposes. The dev can edit them, as per requirement
    DIRECTORY_PERSISTENT = '/var/vcap/store'
    DIRECTORY_SNAPSHOT = '/tmp/service-fabrik-backup/snapshot'
    DIRECTORY_UPLOADS = '/tmp/service-fabrik-backup/uploads'
    UPLOAD_SOURCE = '/var/vcap/store/myfiles.tar.gz'
    UPLOAD_DESTINATION = 'myfiles.tar.gz'
    DOWNLOAD_SOURCE = 'myfiles.tar.gz'
    DOWNLOAD_DESTINATION = '/var/vcap/store/download.tar.gz'

    # +-> Initialization: Argument Parsing, IaaS-Client Creation
    configuration = parse_options('blob_operation')
    iaas_client = create_iaas_client('blob_operation', configuration, DIRECTORY_PERSISTENT, [
                                     DIRECTORY_SNAPSHOT, DIRECTORY_UPLOADS], 10, 18000)
    iaas_client.initialize()

    # This uploads the tarball file present in 'UPLOAD_SOURCE' location to the 'UPLOAD_DESTINATION' in the container
    if not iaas_client.upload_to_blobstore(UPLOAD_SOURCE, UPLOAD_DESTINATION):
                    iaas_client.exit(
                        'Could not upload the tarball')

    # This downloads the tarball file present in 'DOWNLOAD_SOURCE' location of the container to the 'DOWNLOAD_DESTINATION' folder of the vm
    if not iaas_client.download_from_blobstore(DOWNLOAD_SOURCE, DOWNLOAD_DESTINATION):
                iaas_client.exit(
                    'Could not download the tarball')
if __name__ == '__main__':
    main()

