/**
 * Fetches a text file, parses it, and generates HTML content.
 */
async function generateList(divId, filename) {
    const container = document.getElementById(divId);
    if (!container) {
        console.error('Container element not found.');
        return;
    }

    try {
        // Fetch the text file. Assumes it's in the same directory.
        const response = await fetch(filename);
        
        if (!response.ok) {
            throw new Error(`Could not load readings.txt. Status: ${response.status}`);
        }

        const textData = await response.text();

        // Clear the "Loading..." message
        container.innerHTML = '';

        // Split the text file into lines
        const lines = textData.trim().split('\n');

        // Process each line to create the HTML elements
        lines.forEach(line => {
            // Skip any empty lines
            if (line.trim() === '') return;

            // Split the line into category and title using the '|' separator
            const parts = line.split('|');
            if (parts.length !== 2) {
                console.warn(`Skipping malformed line: ${line}`);
                return;
            }

            const [category, title] = parts;

            // Create the HTML elements
            const div = document.createElement('div');
            div.className = 'container left-align';

            const pCategory = document.createElement('p');
            pCategory.className = 'container-item padding';
            pCategory.textContent = category.trim();

            const pTitle = document.createElement('p');
            pTitle.className = 'container-item';
            pTitle.textContent = title.trim();

            // Append the paragraphs to the div, and the div to the main container
            div.appendChild(pCategory);
            div.appendChild(pTitle);
            container.appendChild(div);
        });

    } catch (error) {
        console.error('Failed to generate readings list:', error);
        container.innerHTML = `<p class="text-red-600"><strong>Error:</strong> Could not load the readings data.</p>`;
    }
}


