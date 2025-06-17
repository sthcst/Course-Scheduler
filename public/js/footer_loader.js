// public/js/footer-loader.js

document.addEventListener('DOMContentLoaded', async () => {
    const footerContainer = document.createElement('div'); // Create a temporary container
    footerContainer.id = 'dynamic-footer-container'; // Give it an ID if you want to target it with CSS

    try {
        // Fetch the footer-bar.html content
        // The path here is relative to your HTML file's location
        // For example, if index.html is in public/, and footer-bar.html is in public/partials/,
        // then the path from index.html is 'partials/footer-bar.html'
        const response = await fetch('partials/footer-bar.html'); 
        
        if (!response.ok) {
            throw new Error(`Failed to load footer: ${response.statusText}`);
        }
        
        const footerHtml = await response.text();
        footerContainer.innerHTML = footerHtml; // Insert the fetched HTML

        // Append the new footer element to the body
        document.body.appendChild(footerContainer);

    } catch (error) {
        console.error('Error loading footer partial:', error);
        // Optionally display a fallback footer or error message
        footerContainer.innerHTML = '<footer style="background-color: #f8d7da; color: #721c24; padding: 10px; text-align: center;">Error loading footer.</footer>';
        document.body.appendChild(footerContainer);
    }
});