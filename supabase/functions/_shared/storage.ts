// Use the Storage API, never delete storage.objects rows directly.
export async function removeFolder(admin: any, prefix: string, bucketName='character-portraits'): Promise<void> {
 const bucket=admin.storage.from(bucketName);
 // Delete the first page repeatedly: using offsets while deleting skips files.
 for (;;) {
  const {data,error}=await bucket.list(prefix,{limit:100,offset:0});
  if(error)throw error;if(!data?.length)return;
  const files:string[]=[];
  for(const item of data){const path=prefix+'/'+item.name;if(item.id)files.push(path);else await removeFolder(admin,path,bucketName)}
  if(files.length){const {error}=await bucket.remove(files);if(error)throw error}
 }
}
