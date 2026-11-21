(() => {
    const addButton = document.querySelector('#add-vehicle');
    const modal = document.querySelector('#vehicle-modal');
    const dialog = modal ? modal.querySelector('[role="dialog"]') : null;
    const form = document.querySelector('#vehicle-form');
    const formError = document.querySelector('#vehicle-form-error');
    const title = document.querySelector('#vehicle-modal-title');
    const submitButton = document.querySelector('#vehicle-submit');
    const fileInput = document.querySelector('#vehicle-image');
    const preview = document.querySelector('#vehicle-preview');
    const previewImg = document.querySelector('#vehicle-preview-img');
    const previewLabel = document.querySelector('#vehicle-preview-label');
    const removeButton = document.querySelector('#vehicle-image-remove');
    const cancelModal = document.querySelector('#vehicle-cancel-modal');
    const cancelDialog = cancelModal ? cancelModal.querySelector('[role="dialog"]') : null;
    const deleteModal = document.querySelector('#vehicle-delete-modal');
    const deleteDialog = deleteModal ? deleteModal.querySelector('[role="dialog"]') : null;
    const deleteText = document.querySelector('#vehicle-delete-text');
    const deleteForm = document.querySelector('#vehicle-delete-form');

    if (!modal || !dialog || !form || !fileInput || !cancelModal || !cancelDialog || !deleteModal || !deleteForm) {
        return;
    }

    const fields = {
        make: document.querySelector('#vehicle-make'),
        model: document.querySelector('#vehicle-model'),
        year: document.querySelector('#vehicle-year'),
        color: document.querySelector('#vehicle-color'),
        plate: document.querySelector('#vehicle-plate')
    };

    const maxYear = Number(form.dataset.maxYear) || (new Date().getFullYear() + 1);
    const maxBytes = 5 * 1024 * 1024;
    const imageRequired = 'Add a vehicle image.';
    const imageType = 'Use a JPG, PNG, or WEBP image.';
    const imageSize = 'Image must be 5 MB or smaller.';
    const imageErrors = new Set([imageRequired, imageType, imageSize]);
    const namePattern = /^[\p{L}\p{M}0-9][\p{L}\p{M}0-9 .'-]*$/u;
    const platePattern = /^[ABCDGJMNOPRSTZ]\d{2,7}$/;
    const safeImagePattern = /^\/uploads\/vehicles\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

    let mode = 'add';
    let existingImage = '';
    let previewUrl = '';
    let lastTrigger = null;
    let openDialog = null;

    const showError = (message) => {
        formError.hidden = false;
        formError.textContent = message;
    };

    const clearError = () => {
        formError.hidden = true;
        formError.textContent = '';
    };

    const clearPreviewUrl = () => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = '';
        }
    };

    const showPreview = (src, label, canRemove) => {
        previewImg.src = src;
        previewLabel.textContent = label;
        preview.hidden = false;
        removeButton.hidden = !canRemove;
    };

    const hidePreview = () => {
        clearPreviewUrl();
        previewImg.removeAttribute('src');
        previewLabel.textContent = '';
        preview.hidden = true;
        removeButton.hidden = true;
    };

    const restoreExistingPreview = () => {
        clearPreviewUrl();
        fileInput.value = '';

        if (mode === 'edit' && safeImagePattern.test(existingImage)) {
            showPreview(existingImage, 'Current image', false);
            return;
        }

        hidePreview();
    };

    const selectedFile = () => fileInput.files && fileInput.files[0];

    const fileProblem = (file) => {
        const type = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
        const typeOk = type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
        const extOk = /\.(jpe?g|png|webp)$/i.test(file.name);

        if (!typeOk || !extOk || file.size < 1) {
            return imageType;
        }

        if (file.size > maxBytes) {
            return imageSize;
        }

        return '';
    };

    const cleanText = (value) => value.trim().replace(/\s+/g, ' ');

    const fieldProblem = () => {
        const make = cleanText(fields.make.value);
        const model = cleanText(fields.model.value);
        const year = cleanText(fields.year.value);
        const plate = fields.plate.value.trim();
        const color = cleanText(fields.color.value);

        if (!make) {
            return 'Please enter the make.';
        }

        if (make.length > 50) {
            return 'Make must be 50 characters or fewer.';
        }

        if (!namePattern.test(make)) {
            return 'Make can only include letters, numbers, spaces, apostrophes, periods, and hyphens.';
        }

        if (!model) {
            return 'Please enter the model.';
        }

        if (model.length > 50) {
            return 'Model must be 50 characters or fewer.';
        }

        if (!namePattern.test(model)) {
            return 'Model can only include letters, numbers, spaces, apostrophes, periods, and hyphens.';
        }

        const yearNumber = Number(year);
        if (!/^\d{4}$/.test(year) || yearNumber < 1900 || yearNumber > maxYear) {
            return `Enter a year from 1900 to ${maxYear}.`;
        }

        const allowedColor = [...fields.color.options].some((option) => option.value === color);

        if (!color || !allowedColor) {
            return 'Please choose a color.';
        }

        if (!plate) {
            return 'Please enter the license plate.';
        }

        if (!platePattern.test(plate.toUpperCase().replace(/[\s-]+/g, ''))) {
            return 'Enter a valid Lebanese license plate.';
        }

        const file = selectedFile();
        if (mode === 'add' && !file) {
            return imageRequired;
        }

        if (file) {
            return fileProblem(file);
        }

        return '';
    };

    const focusable = (container) => {
        return [...container.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])')]
            .filter((item) => !item.disabled && !item.hidden && item.getAttribute('type') !== 'hidden' && item.offsetParent !== null);
    };

    const setOpen = (next) => {
        openDialog = next;
        document.body.classList.toggle('customer-modal-open', Boolean(next));
    };

    const formIsEmpty = () => {
        const textEmpty = [fields.make, fields.model, fields.year, fields.color, fields.plate]
            .every((field) => !cleanText(field.value));

        return textEmpty && !selectedFile();
    };

    const closeModal = () => {
        cancelModal.hidden = true;
        modal.hidden = true;
        setOpen(null);
        clearPreviewUrl();
        if (lastTrigger) {
            lastTrigger.focus();
        }
    };

    const closeCancelConfirm = () => {
        cancelModal.hidden = true;
        setOpen(dialog);
        const cancelButton = document.querySelector('#vehicle-cancel');
        if (cancelButton) {
            cancelButton.focus();
        }
    };

    const openCancelConfirm = () => {
        const title = document.querySelector('#vehicle-cancel-title');
        const text = document.querySelector('#vehicle-cancel-text');

        if (mode === 'edit') {
            title.textContent = 'Cancel editing this vehicle?';
            text.textContent = 'Your changes will not be saved.';
        } else {
            title.textContent = 'Discard this vehicle?';
            text.textContent = 'The details you entered will not be saved.';
        }

        cancelModal.hidden = false;
        setOpen(cancelDialog);
        document.querySelector('#vehicle-cancel-stay').focus();
    };

    const requestClose = () => {
        if (mode === 'edit' || (mode === 'add' && !formIsEmpty())) {
            openCancelConfirm();
            return;
        }

        closeModal();
    };

    const openModal = (trigger) => {
        lastTrigger = trigger || addButton;
        clearError();
        submitButton.disabled = false;
        modal.hidden = false;
        setOpen(dialog);
        window.requestAnimationFrame(() => fields.make.focus());
    };

    const openAdd = () => {
        mode = 'add';
        existingImage = '';
        form.action = '/customer/vehicles';
        title.textContent = 'Add Vehicle';
        submitButton.textContent = 'Add Vehicle';
        fields.make.value = '';
        fields.model.value = '';
        fields.year.value = '';
        fields.color.value = '';
        fields.plate.value = '';
        fileInput.value = '';
        hidePreview();
        openModal(addButton);
    };

    const openEdit = (button) => {
        const id = button.dataset.id || '';
        if (!/^[1-9]\d*$/.test(id)) {
            return;
        }

        mode = 'edit';
        existingImage = button.dataset.image || '';
        form.action = `/customer/vehicles/${id}/edit`;
        title.textContent = 'Edit vehicle';
        submitButton.textContent = 'Save changes';
        fields.make.value = button.dataset.make || '';
        fields.model.value = button.dataset.model || '';
        fields.year.value = button.dataset.year || '';
        const savedColor = (button.dataset.color || '').trim().toLowerCase();
        const colorOption = [...fields.color.options].find((option) => option.value.toLowerCase() === savedColor);
        fields.color.value = colorOption ? colorOption.value : '';
        fields.plate.value = button.dataset.licensePlate || '';
        restoreExistingPreview();
        openModal(button);
    };

    const closeDelete = () => {
        deleteModal.hidden = true;
        deleteForm.action = '';
        setOpen(null);
        if (lastTrigger) {
            lastTrigger.focus();
        }
    };

    const openDelete = (button) => {
        const id = button.dataset.id || '';
        if (!/^[1-9]\d*$/.test(id)) {
            return;
        }

        lastTrigger = button;
        deleteText.textContent = `Delete ${button.dataset.name || 'this vehicle'}? This removes the vehicle and its image.`;
        deleteForm.action = `/customer/vehicles/${id}/delete`;
        deleteModal.hidden = false;
        setOpen(deleteDialog);
        const cancel = document.querySelector('#vehicle-delete-cancel');
        if (cancel) {
            cancel.focus();
        }
    };

    if (addButton) {
        addButton.addEventListener('click', openAdd);
    }

    document.querySelectorAll('.customer-vehicle-edit').forEach((button) => {
        button.addEventListener('click', () => openEdit(button));
    });

    document.querySelectorAll('.customer-vehicle-delete').forEach((button) => {
        button.addEventListener('click', () => openDelete(button));
    });

    document.querySelector('#vehicle-cancel').addEventListener('click', requestClose);
    document.querySelector('#vehicle-modal-close').addEventListener('click', requestClose);
    document.querySelector('#vehicle-cancel-stay').addEventListener('click', closeCancelConfirm);
    document.querySelector('#vehicle-cancel-confirm').addEventListener('click', closeModal);
    document.querySelector('#vehicle-delete-cancel').addEventListener('click', closeDelete);

    cancelModal.addEventListener('click', (event) => {
        if (event.target === cancelModal) {
            closeCancelConfirm();
        }
    });

    deleteModal.addEventListener('click', (event) => {
        if (event.target === deleteModal) {
            closeDelete();
        }
    });

    fileInput.addEventListener('change', () => {
        const file = selectedFile();
        if (!file) {
            restoreExistingPreview();
            return;
        }

        const problem = fileProblem(file);
        if (problem) {
            restoreExistingPreview();
            showError(problem);
            return;
        }

        clearPreviewUrl();
        previewUrl = URL.createObjectURL(file);
        showPreview(previewUrl, 'New image', true);

        if (imageErrors.has(formError.textContent)) {
            clearError();
        }
    });

    removeButton.addEventListener('click', () => {
        restoreExistingPreview();
        if (imageErrors.has(formError.textContent)) {
            clearError();
        }
        fileInput.focus();
    });

    form.addEventListener('submit', (event) => {
        const problem = fieldProblem();
        if (problem) {
            event.preventDefault();
            showError(problem);
            return;
        }

        submitButton.disabled = true;
    });

    deleteForm.addEventListener('submit', (event) => {
        let pathname = '';
        try {
            pathname = new URL(deleteForm.action, window.location.origin).pathname;
        } catch (error) {
            pathname = '';
        }

        if (!/^\/customer\/vehicles\/[1-9]\d*\/delete$/.test(pathname)) {
            event.preventDefault();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (!openDialog) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (openDialog === deleteDialog) {
                closeDelete();
            } else if (openDialog === cancelDialog) {
                closeCancelConfirm();
            } else {
                closeModal();
            }
            return;
        }

        if (event.key !== 'Tab') {
            return;
        }

        const items = focusable(openDialog);
        if (!items.length) {
            return;
        }

        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
})();
