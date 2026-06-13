# 🌐 GitHub Pages Setup Guide

## ⚠️ **Current Status**
GitHub Pages is not yet enabled for your repository. You need to enable it manually in GitHub settings.

## 📋 **Step-by-Step Setup**

### **1. Go to Repository Settings**
1. Visit: https://github.com/Batcat72/Website/settings/pages
2. Scroll down to the "Build and deployment" section

### **2. Enable GitHub Pages**
1. Under "Source", select **"Deploy from a branch"**
2. Choose **"master"** as the branch
3. Select **"/ (root)"** as the folder
4. Click **"Save"**

### **3. Wait for Deployment**
- GitHub will build your site (2-5 minutes)
- You'll see a green checkmark when ready
- The Actions tab will show build progress

## 🔧 **Alternative Setup Options**

### **Option A: Main Branch (Recommended)**
```
Source: Deploy from a branch
Branch: master
Folder: / (root)
```

### **Option B: GitHub Actions (Automatic)**
```
Source: GitHub Actions
(This will use our workflow file)
```

### **Option C: Docs Folder**
```
Source: Deploy from a branch
Branch: master  
Folder: /docs
(Requires moving built files to /docs folder)
```

## 🎯 **Expected URLs**

Once enabled, your site will be available at:
- **Primary:** https://batcat72.github.io/Website
- **Custom domain:** https://yourdomain.com (if configured)

## 🔍 **Troubleshooting**

### **If Pages doesn't appear:**
1. Check the Actions tab for build errors
2. Verify branch is "master" (not "main")
3. Ensure folder is "/ (root)"
4. Check for Jekyll conflicts (add .nojekyll file)

### **Common Issues:**

#### **Build Fails**
```bash
# Check Actions tab
https://github.com/Batcat72/Website/actions

# Common fixes:
- Ensure package.json has "homepage": "https://batcat72.github.io/Website"
- Check Vite base path configuration
- Verify build script works locally
```

#### **404 Errors**
```bash
# Verify deployment settings
- Check correct folder selection
- Ensure index.html exists in build output
- Verify file paths in build
```

#### **Styling Issues**
```bash
# Check asset paths
- Verify base URL in Vite config
- Check CSS file references
- Ensure assets are in build output
```

## 🚀 **Quick Fix Commands**

### **Add .nojekyll file (if needed)**
```bash
# Create in repository root
touch .nojekyll
git add .nojekyll
git commit -m "Add .nojekyll for GitHub Pages"
git push origin master
```

### **Force rebuild**
```bash
# Trigger rebuild by pushing empty commit
git commit --allow-empty -m "Trigger GitHub Pages rebuild"
git push origin master
```

## 📊 **What Should Be Working**

Once GitHub Pages is enabled, you should see:
- ✅ React application loading
- ✅ All navigation working
- ✅ Static assets loading correctly
- ✅ Responsive design on mobile

## 🔗 **Useful Links**

- **Repository Settings:** https://github.com/Batcat72/Website/settings/pages
- **Actions Monitor:** https://github.com/Batcat72/Website/actions
- **Pages Status:** https://github.com/Batcat72/Website/pages

## 📞 **Need Help?**

1. **Check this guide** for troubleshooting steps
2. **Visit GitHub Pages documentation** for detailed setup
3. **Review Actions logs** for specific errors

---

**🎯 Next Steps:**
1. Go to repository settings and enable GitHub Pages
2. Choose "Deploy from a branch" with "master" branch
3. Wait for deployment and test the site
4. Debug any issues using the Actions tab
