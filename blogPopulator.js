/**
         * Fetches and parses HTML blog files to create an index table.
         * @param {string} targetDivId - The ID of the div element to populate with the table.
         * @param {Object} metadata - An object which contains the filename, title, and 
         * and values are the HTML content as strings.
         */
function populateBlogIndex(targetDivId, metadata) {
    const targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) {
        console.error(`Target div with id "${targetDivId}" not found.`);
        return;
    }

    const blogs = metadata.blogs;
    for (const number in blogs) {
        try {
            const file = blogs[number];
            const filename = file.filename;
            const title = file.title;
            const tags = file.tags;
            const published = file.published;
            
            const div = document.createElement('div');
            div.className = 'container left-align';

            const pTitle = document.createElement('a');
            pTitle.className = 'container-item padding';
            pTitle.textContent = title.trim();
            pTitle.href = `blogs/${filename.trim()}`;
            pTitle.target = '_blank()';

            const pCategory = document.createElement('p');
            pCategory.className = 'container-item';
            pCategory.textContent = `Published ${published}. Tags: ${tags.join(', ')}`;

            div.appendChild(pTitle);
            div.appendChild(pCategory);
            targetDiv.appendChild(div);

        } catch (error) {
            console.error(`Could not process file: ${metadata}`, error);
        }
    }
}

/**
 * Fetches blog content from files on a static site and populates the index.
 */
async function loadBlogs() {
    const targetDiv = document.getElementById('blogs');
    try {
        const metadataPromise = fetch('blogs/metadata.json')
            .then(response => {
                if(response.ok) {
                    return response.json();
                }
                else {
                    throw new Error(`Could not load ${filename}. Status: ${response.status}`)
                }
            });
            const metadata = await metadataPromise;
            populateBlogIndex('blogs', metadata);
    } catch (error) {
        console.error("Error loading metadata files:", error);
        if (targetDiv) {
            targetDiv.innerHTML = `<div class="p-4 text-center text-red-600 bg-red-100 rounded-lg">
                <p><strong>Failed to load blog posts.</strong></p>
                <p class="text-sm">Check the console for errors and make sure the file paths in the 'filenames' array are correct.</p>
            </div>`;
        }
        
    }
  }