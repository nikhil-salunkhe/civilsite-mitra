import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, FormSection, FormRow, FormGroup } from '../components/UI';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const ProfilePage = () => {
  const { user, updateProfile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    mobile: user?.mobile || '',
    company: user?.company || '',
    street: user?.address?.street || '',
    city: user?.address?.city || '',
    state: user?.address?.state || '',
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [errors, setErrors] = useState({});

  // Re-sync when the context profile is replaced (login, admin edit, refresh).
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: user?.name || '',
      email: user?.email || '',
      mobile: user?.mobile || '',
      company: user?.company || '',
      street: user?.address?.street || '',
      city: user?.address?.city || '',
      state: user?.address?.state || '',
    }));
  }, [user?._id]);

  // Object URLs pin the whole file in memory, so release them on change/unmount.
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    },
    [photoPreview]
  );

  const currentPhoto = user?.profilePhoto || '';

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (JPG, PNG or WEBP)');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('Image must be smaller than 5 MB');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleChange = (field, value) => {
    setForm(p => ({ ...p, [field]: value }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.mobile.trim()) e.mobile = 'Required';
    else if (!/^\d{10}$/.test(form.mobile)) e.mobile = '10 digits';
    // Only a Super Admin may change their own login email (enforced on the backend too).
    if (isAdmin) {
      if (!form.email.trim()) e.email = 'Required';
      else if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const address = { street: form.street, city: form.city, state: form.state };
      if (photoFile) {
        // Multipart so multer receives the photo. Multipart bodies only carry
        // flat string values, hence the JSON encoded address.
        const fd = new FormData();
        fd.append('name', form.name);
        fd.append('email', form.email);
        fd.append('mobile', form.mobile);
        fd.append('company', form.company || '');
        fd.append('address', JSON.stringify(address));
        fd.append('photo', photoFile);
        await updateProfile(fd);
      } else {
        await updateProfile({
          name: form.name,
          email: form.email,
          mobile: form.mobile,
          company: form.company,
          address,
        });
      }
      removePhoto();
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="Profile" subtitle="Manage your account information" />
      <form onSubmit={handleSubmit} className="card space-y-6">
        <FormSection title="Profile Photo">
          <div className="flex items-center gap-4">
            {photoPreview || currentPhoto ? (
              <img
                src={photoPreview || currentPhoto}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border border-gray-200"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-semibold">
                {(user?.name || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="block w-full text-sm text-gray-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:text-sm"
              />
              <p className="text-xs text-gray-400">JPG, PNG or WEBP up to 5 MB. Saved when you click Save Changes.</p>
              {(photoFile || photoPreview) && (
                <button type="button" onClick={removePhoto} className="text-xs text-danger-600 hover:underline">
                  Remove selected photo
                </button>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection title="Personal Information">
          <FormGroup label="Full Name" error={errors.name}>
            <input type="text" value={form.name} onChange={e => handleChange('name', e.target.value)} className="input" />
          </FormGroup>
          <FormGroup label="Mobile Number" error={errors.mobile}>
            <input type="text" value={form.mobile} onChange={e => handleChange('mobile', e.target.value)} className="input" maxLength={10} />
          </FormGroup>
          <FormGroup label="Email (Login ID)" error={errors.email}>
            <input
              type="email"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              className={isAdmin ? 'input' : 'input bg-gray-50'}
              disabled={!isAdmin}
            />
            <p className="text-xs text-gray-400 mt-1">
              {isAdmin
                ? 'You can change your own login email'
                : 'Email cannot be changed. Please contact your administrator.'}
            </p>
          </FormGroup>
          <FormGroup label="Company/Business Name">
            <input type="text" value={form.company} onChange={e => handleChange('company', e.target.value)} className="input" />
          </FormGroup>
        </FormSection>

        <FormSection title="Address">
          <FormGroup label="Street Address">
            <input type="text" value={form.street} onChange={e => handleChange('street', e.target.value)} className="input" />
          </FormGroup>
          <FormRow>
            <FormGroup label="City">
              <input type="text" value={form.city} onChange={e => handleChange('city', e.target.value)} className="input" />
            </FormGroup>
            <FormGroup label="State">
              <input type="text" value={form.state} onChange={e => handleChange('state', e.target.value)} className="input" />
            </FormGroup>
          </FormRow>
        </FormSection>

        <div className="flex justify-end pt-4 border-t">
          <div className="flex gap-3">
            <button type="button" onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/dashboard')} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
