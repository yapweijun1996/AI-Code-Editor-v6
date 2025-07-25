// This is a simple test script to be executed from the main app to verify folder operations.

async function runFolderManagementTests(rootDirectoryHandle) {
    console.group("Folder Management Tests");

    const testFolderName = "test_suite_temp_folder";
    const nestedFolderName = "nested_folder";
    const renamedNestedFolderName = "renamed_nested_folder";
    let testDirHandle;

    try {
        // 1. Create a new folder
        console.log(`[Test 1] Creating folder: ${testFolderName}`);
        testDirHandle = await rootDirectoryHandle.getDirectoryHandle(testFolderName, { create: true });
        console.log("[Test 1] PASSED: Folder created successfully.");

        // 2. Create a nested folder
        console.log(`[Test 2] Creating nested folder: ${nestedFolderName}`);
        await testDirHandle.getDirectoryHandle(nestedFolderName, { create: true });
        console.log("[Test 2] PASSED: Nested folder created successfully.");

        // 3. Rename the nested folder (by moving)
        console.log(`[Test 3] Renaming nested folder to: ${renamedNestedFolderName}`);
        const nestedDirHandle = await testDirHandle.getDirectoryHandle(nestedFolderName);
        const renamedDirHandle = await testDirHandle.getDirectoryHandle(renamedNestedFolderName, { create: true });

        // Simple move - copy a dummy file to simulate content
        const dummyFileHandle = await nestedDirHandle.getFileHandle("test.txt", { create: true });
        const writable = await dummyFileHandle.createWritable();
        await writable.write("hello");
        await writable.close();

        const movedFileHandle = await renamedDirHandle.getFileHandle("test.txt", { create: true });
        const movedWritable = await movedFileHandle.createWritable();
        const file = await dummyFileHandle.getFile();
        await movedWritable.write(await file.arrayBuffer());
        await movedWritable.close();

        await nestedDirHandle.removeEntry("test.txt");
        await testDirHandle.removeEntry(nestedFolderName);
        console.log("[Test 3] PASSED: Folder renamed successfully.");


        // 4. Delete the main test folder
        console.log(`[Test 4] Deleting main test folder: ${testFolderName}`);
        await rootDirectoryHandle.removeEntry(testFolderName, { recursive: true });
        console.log("[Test 4] PASSED: Main test folder deleted successfully.");

        console.log("All folder management tests passed!");

    } catch (error) {
        console.error("A folder management test failed:", error);
    } finally {
        // Cleanup in case of failure
        try {
            await rootDirectoryHandle.removeEntry(testFolderName, { recursive: true });
            console.log("Cleanup successful.");
        } catch (e) {
            // Ignore cleanup errors if the folder was already deleted
        }
        console.groupEnd();
    }
}