namespace CertifBuddy.Core;

public static class UiText
{
    private static readonly IReadOnlyDictionary<string, (string French, string English)> Texts =
        new Dictionary<string, (string French, string English)>(StringComparer.Ordinal)
        {
            ["PackageFrequencies"] = ("Fréquence des paquets", "Package frequencies"),
            ["PackageFrequencyHelp"] = ("Réglez chaque pourcentage avec le curseur ou au clavier (minimum 1 %, total 100 %). Modifier un paquet ajuste le premier ; modifier le premier ajuste le deuxième. Si nécessaire, les autres paquets absorbent le reste. Le paquet est tiré au sort selon cette répartition, puis ses questions de faible niveau sont prioritaires. La proportion est visée sur la durée, sans quota par série. Les paquets épuisés sont temporairement écartés. Ajouter ou retirer un paquet rééquilibre les fréquences.", "Set each percentage using the slider or keyboard (minimum 1%, total 100%). Changing a package adjusts the first; changing the first adjusts the second. Other packages absorb any remainder if needed. The package is drawn using this distribution, then its lowest-level questions take priority. Proportions are targeted over time, not quotas per series. Exhausted packages are temporarily skipped. Adding or removing a package resets frequencies to an even distribution."),
            ["PackageFrequencyValidation"] = ("Chaque fréquence doit être un entier de 1 à 100 et le total doit être égal à 100 %.", "Each frequency must be a whole number from 1 to 100 and the total must equal 100%."),
            ["PackageFrequencyLimit"] = ("Vous pouvez sélectionner au maximum 100 paquets pour garantir au moins 1 % par paquet.", "Select at most 100 packages to allow at least 1% per package."),
            ["NavigationHeading"] = ("Espaces", "Spaces"),
            ["NavigationHome"] = ("_Accueil", "_Home"),
            ["NavigationPackages"] = ("Paquets & _questions", "Packages & _questions"),
            ["NavigationLibrary"] = ("_Bibliothèque", "_Library"),
            ["LibraryHeading"] = ("Bibliothèque", "Library"),
            ["LibraryDescription"] = ("Paquets de certification fournis avec Certif Buddy. Téléchargez un paquet pour le retrouver dans Paquets & questions et le réviser.", "Certification packages bundled with Certif Buddy. Download a package to find it in Packages & questions and review it."),
            ["LibraryPackagesHeading"] = ("Certifications disponibles", "Available certifications"),
            ["SearchLibrary"] = ("Rechercher une certification", "Search certifications"),
            ["LibraryViewCards"] = ("Voir les cartes", "View cards"),
            ["LibraryViewCardsOf"] = ("Voir les cartes de {0}", "View the cards of {0}"),
            ["LibraryDownload"] = ("Télécharger", "Download"),
            ["LibraryDownloadOf"] = ("Télécharger {0} dans Paquets & questions", "Download {0} to Packages & questions"),
            ["LibraryDownloaded"] = ("Téléchargé", "Downloaded"),
            ["LibraryDownloadedOf"] = ("{0} est déjà téléchargé dans Paquets & questions", "{0} is already downloaded to Packages & questions"),
            ["LibraryDownloadCompleted"] = ("« {0} » a été ajouté à Paquets & questions.", "“{0}” was added to Packages & questions."),
            ["LibraryLoading"] = ("Chargement de la bibliothèque…", "Loading the library…"),
            ["LibraryLoadFailed"] = ("La bibliothèque n’a pas pu être chargée : {0}", "The library could not be loaded: {0}"),
            ["LibraryEmpty"] = ("Aucun paquet n’est disponible dans la bibliothèque.", "No packages are available in the library."),
            ["LibraryNoMatch"] = ("Aucune certification ne correspond à la recherche.", "No certification matches the search."),
            ["LibraryCardsTitle"] = ("Cartes de la bibliothèque", "Library cards"),
            ["NavigationStatistics"] = ("_Statistiques", "_Statistics"),
            ["NavigationAvatar"] = ("A_vatar", "_Avatar"),
            ["NavigationOptions"] = ("_Options", "_Options"),
            ["NavigationOtherResources"] = ("Autres _ressources", "Other _resources"),
            ["OtherResourcesAccessibleName"] = ("Autres ressources — redirection externe", "Other resources — external redirect"),
            ["OtherResourcesRedirectHint"] = ("Ouvre le wiki Certifications Azure DevOps dans votre navigateur par défaut.", "Opens the Azure DevOps Certifications wiki in your default browser."),
            ["OtherResourcesOpenFailedTitle"] = ("Redirection impossible", "Unable to open external link"),
            ["OtherResourcesOpenFailedMessage"] = ("Le navigateur n’a pas pu être ouvert : {0}", "The browser could not be opened: {0}"),
            ["ExternalLinkOpenFailedTitle"] = ("Lien impossible à ouvrir", "Unable to open link"),
            ["ExternalLinkOpenFailedMessage"] = ("Le navigateur n’a pas pu être ouvert : {0}", "The browser could not be opened: {0}"),
            ["OptionsTitle"] = ("Options", "Options"),
            ["OptionsSubtitle"] = ("Réglez la langue et l’apparence de l’interface, ainsi que le comportement de l’assistant.", "Set the interface language and appearance, and how the assistant behaves."),
            ["AvatarTitle"] = ("Avatar", "Avatar"),
            ["AvatarSizeHeading"] = ("Taille", "Size"),
            ["AvatarSizeLabel"] = ("Taille de l’avatar", "Avatar size"),
            ["BubbleSizeLabel"] = ("Taille de la bulle", "Bubble size"),
            ["AvatarSizeShortLabel"] = ("Avatar", "Avatar"),
            ["BubbleSizeShortLabel"] = ("Bulle", "Bubble"),
            ["SizeValueFieldName"] = ("{0}, en pourcentage", "{0}, in percent"),
            ["SizeInvalidNumber"] = ("Saisissez un nombre entier entre 50 et 200.", "Enter a whole number between 50 and 200."),
            ["SizeAdjusted"] = ("Valeur ajustée à {0} % : la taille doit être comprise entre 50 % et 200 %.", "Value adjusted to {0}%: the size must be between 50% and 200%."),
            ["BubblePreviewShow"] = ("Aperçu de la bulle", "Preview bubble"),
            ["BubblePreviewHide"] = ("Masquer l’aperçu", "Hide preview"),
            ["BubblePreviewHint"] = ("Affiche une bulle d’exemple à côté du compagnon, sans enregistrer de révision.", "Shows a sample bubble next to the companion, without recording a review."),
            ["BubblePreviewUnavailable"] = ("Aperçu indisponible pendant qu’une question est affichée.", "Preview unavailable while a question is displayed."),
            ["BubblePreviewTitle"] = ("Aperçu de la bulle", "Bubble preview"),
            ["BubblePreviewQuestion"] = ("Exemple : quel service Azure permet d’héberger une application web sans gérer de serveur ?", "Example: which Azure service hosts a web app without managing servers?"),
            ["BubblePreviewAnswer"] = ("Azure App Service", "Azure App Service"),
            ["BubblePreviewExplanation"] = ("Ceci est un aperçu : les boutons ferment la bulle sans enregistrer de révision.", "This is a preview: the buttons close the bubble without recording a review."),
            ["PauseDuringTeamsMeetings"] = ("Masquer et mettre en pause l’assistant pendant les réunions Teams", "Hide and pause the assistant during Teams meetings"),
            ["TeamsMeetingHelp"] = ("Teams Windows (interface FR/EN) : détection locale du bouton Quitter/Raccrocher, même avec le micro coupé. L’état précédent est restauré à la fin ; aucune question manquée n’est rattrapée. Teams dans le navigateur n’est pas pris en charge. La détection dépend des commandes d’accessibilité exposées par Teams.", "Teams for Windows (French/English UI): locally detects the Leave/Hang up button, even with the microphone muted. The previous state is restored afterwards; missed questions are not replayed. Teams in a browser is not supported. Detection depends on the accessibility controls exposed by Teams."),
            ["TeamsDetectionFailure"] = ("La détection Teams est indisponible. Le dernier état connu est conservé ; une nouvelle tentative sera effectuée automatiquement.", "Teams detection is unavailable. The last known state is retained; detection will retry automatically."),
            ["AssistantPausedForTeams"] = ("Assistant masqué et en pause : réunion Teams en cours.", "Assistant hidden and paused: Teams meeting in progress."),
            ["NavigationPlaceholderHeading"] = ("Cet espace sera raccordé dans une prochaine étape.", "This space will be connected in a later step."),
            ["NavigationLegacyToolsNotice"] = ("Les commandes de révision et les statistiques restent accessibles depuis l’Accueil.", "Review controls and statistics remain available from Home."),
            ["NavigationReturnHome"] = ("Retour à l’accueil", "Return to Home"),
            ["NavigationCurrentPageStatus"] = ("Espace actuel", "Current space"),
            ["AvatarPresetsHeading"] = ("Choisissez l’apparence de votre compagnon", "Choose your companion’s appearance"),
            ["AvatarPresetsDescription"] = ("Comparez les animations de prévisualisation. Votre compagnon ne change qu’après confirmation.", "Compare the animated previews. Your companion changes only after you confirm."),
            ["AvatarOwlName"] = ("Chouette", "Owl"),
            ["AvatarFoxName"] = ("Renard", "Fox"),
            ["AvatarAxolotlName"] = ("Axolotl", "Axolotl"),
            ["AvatarSunName"] = ("Esquie", "Esquie"),
            ["AvatarCatName"] = ("Chat", "Cat"),
            ["AvatarDogName"] = ("Chien", "Dog"),
            ["AvatarPandaName"] = ("Panda", "Panda"),
            ["AvatarGibbonName"] = ("Gibbon", "Gibbon"),
            ["AvatarCurrentPreset"] = ("Actuellement appliqué", "Currently applied"),
            ["AvatarApplySelection"] = ("Appliquer ce choix au compagnon", "Apply this choice to the companion"),
            ["AvatarCurrentSelection"] = ("Apparence actuelle : {0}.", "Current appearance: {0}."),
            ["AvatarCurrentSelectionUnavailable"] = ("L’apparence enregistrée n’est pas disponible. Choisissez un preset valide pour réparer la sélection.", "The saved appearance is unavailable. Choose a valid preset to repair the selection."),
            ["AvatarSelectionPending"] = ("Prévisualisation de {0}. Confirmez pour appliquer ce choix.", "Previewing {0}. Confirm to apply this choice."),
            ["AvatarSelectionApplied"] = ("{0} est maintenant appliqué au compagnon.", "{0} is now applied to the companion."),
            ["AvatarSelectionSaveFailed"] = ("Le choix n’a pas été enregistré ; l’apparence actuelle du compagnon n’a pas changé.", "The choice was not saved; the companion’s current appearance has not changed."),
            ["AvatarSelectionLoadFailure"] = ("Le preset n’a pas pu être chargé et n’a pas été appliqué : {0}", "The preset could not be loaded and was not applied: {0}"),
            ["AvatarPreviewFailure"] = ("Prévisualisation indisponible : {0}", "Preview unavailable: {0}"),
            ["HomeTitle"] = ("Votre espace de révision", "Your review space"),
            ["HomeSubtitle"] = ("Préparez votre prochaine session et gardez le contrôle de votre rythme.", "Set up your next session and stay in control of your review pace."),
            ["HomeStatusHeading"] = ("État de la session", "Session status"),
            ["HomeSettingsHeading"] = ("Votre rythme", "Your review pace"),
            ["IntervalMode"] = ("Par intervalle", "By interval"),
            ["FixedScheduleMode"] = ("Horaires fixes", "Fixed times"),
            ["ScheduleTime"] = ("Heure (HH:mm)", "Time (HH:mm)"),
            ["AddScheduleSlot"] = ("Ajouter un horaire", "Add a time"),
            ["RemoveScheduleSlot"] = ("Supprimer", "Remove"),
            ["DailyScheduleHelp"] = ("Chaque jour, en heure locale : choisissez les horaires et le nombre de questions de chaque série. Les créneaux manqués ne sont pas rattrapés. Seules les cartes admissibles sont proposées.", "Every day, in local time: choose the times and the number of questions in each series. Missed slots are not replayed. Only eligible cards are offered."),
            ["InvalidDailySchedule"] = ("Ajoutez au moins un horaire au format HH:mm (00:00 à 23:59), sans doublon, avec un nombre entier de questions supérieur à zéro pour chaque horaire.", "Add at least one time in HH:mm format (00:00 to 23:59), with no duplicates and a positive whole question count for each time."),
            ["HomeCompanionHeading"] = ("Votre compagnon", "Your companion"),
            ["HomeManagePackages"] = ("Gérer les paquets", "Manage packages"),
            ["AssistantHeading"] = ("Assistant de révision", "Revision assistant"),
            ["AssistantRunning"] = ("Assistant actif", "Assistant active"),
            ["AssistantStopped"] = ("Assistant arrêté", "Assistant stopped"),
            ["ActivePackageStatus"] = ("Paquet actif : {0}", "Active package: {0}"),
            ["NoActivePackageStatus"] = ("Aucun paquet actif.", "No active package."),
            ["NextSeriesAvailable"] = ("Prochaine série disponible maintenant.", "Next series is available now."),
            ["NextSeriesQuestionAvailable"] = ("Question suivante de la série disponible maintenant.", "Next question in the series is available now."),
            ["NextQuestionScheduled"] = ("Prochaine question dans {0}.", "Next question in {0}."),
            ["SeriesInProgress"] = ("Série en cours : question {0} sur {1}.", "Series in progress: question {0} of {1}."),
            ["ManualReviewInProgress"] = ("Une question est en cours.", "A question is in progress."),
            ["AssistantInterval"] = ("Pause après une série (minutes)", "Pause after a series (minutes)"),
            ["IntervalTooltip"] = ("Nombre entier de minutes (au moins 1) après la fin de chaque série", "Whole number of minutes (at least 1) after each series ends"),
            ["ReviewIntervalStartHelp"] = ("Le délai commence après la fin de la série.", "The delay starts after the series ends."),
            ["ReviewSnoozeMinutes"] = ("Rappel après (minutes)", "Snooze duration (minutes)"),
            ["ReviewSnoozeMinutesTooltip"] = ("Nombre entier de minutes de 1 à 120", "Whole number from 1 to 120 minutes"),
            ["QuestionsPerSeries"] = ("Questions par série", "Questions per series"),
            ["QuestionsPerSeriesTooltip"] = ("Nombre entier positif, sans plafond ajouté", "Positive whole number with no artificial maximum"),
            ["Save"] = ("Enregistrer", "Save"),
            ["InterfaceLanguage"] = ("Langue de l’interface", "Interface language"),
            ["French"] = ("Français", "French"),
            ["English"] = ("English", "English"),
            ["AppearanceHeading"] = ("Apparence", "Appearance"),
            ["InterfaceTheme"] = ("Thème", "Theme"),
            ["ThemeSystem"] = ("Système", "System"),
            ["ThemeLight"] = ("Clair", "Light"),
            ["ThemeDark"] = ("Sombre", "Dark"),
            ["InterfaceThemeHelp"] = ("« Système » suit le mode clair ou sombre choisi dans les paramètres de Windows.", "“System” follows the light or dark mode chosen in Windows settings."),
            ["StartAssistant"] = ("Démarrer l’assistant", "Start assistant"),
            ["ResumeAssistant"] = ("Reprendre l’assistant", "Resume assistant"),
            ["PauseAssistant"] = ("Mettre en pause", "Pause"),
            ["PresentReview"] = ("Présenter une question", "Present a question"),
            ["HideCompanion"] = ("Masquer le compagnon", "Hide companion"),
            ["ShowCompanion"] = ("Afficher le compagnon", "Show companion"),
            ["DisableCompanionWandering"] = ("Arrêter la marche du compagnon", "Stop companion walking"),
            ["EnableCompanionWandering"] = ("Activer la marche du compagnon", "Enable companion walking"),
            ["ShowApplication"] = ("Afficher l’application", "Show application"),
            ["ExitApplication"] = ("Quitter Certif Buddy", "Exit Certif Buddy"),
            ["RunningInBackground"] = ("Certif Buddy reste actif dans la zone de notification. Pour le fermer complètement, utilisez « Quitter Certif Buddy » depuis son icône.", "Certif Buddy keeps running in the notification area. To close it completely, use “Exit Certif Buddy” from its icon."),
            ["LaunchAtStartup"] = ("Lancer Certif Buddy au démarrage de Windows", "Launch Certif Buddy when Windows starts"),
            ["LaunchAtStartupHelp"] = ("Au démarrage de la session, Certif Buddy s’ouvre en arrière-plan : seuls le compagnon et l’icône de la zone de notification apparaissent.", "When you sign in, Certif Buddy opens in the background: only the companion and the notification area icon appear."),
            ["StartupRegistrationFailure"] = ("Le lancement au démarrage de Windows n’a pas pu être modifié.", "Launch at Windows startup could not be changed."),
            ["AutoHideCompanionAfterSeries"] = ("Masquer automatiquement le compagnon à la fin d’une série de questions", "Automatically hide the companion at the end of a question series"),
            ["AutoHideCompanionAfterSeriesHelp"] = ("Désactivé par défaut. Le compagnon reste visible après chaque série, sauf si vous activez cette option.", "Disabled by default. The companion stays visible after each series unless you enable this option."),
            ["ReviewInvitation"] = ("Une série de révision vous attend.", "A review series is ready."),
            ["ShowReviewInvitation"] = ("Afficher", "Show"),
            ["SnoozeReview"] = ("Reporter {0} min", "Snooze {0} min"),
            ["NoCardsAvailable"] = ("Aucune carte disponible", "No cards available"),
            ["SelectPackageForReview"] = ("Sélectionnez un paquet contenant des cartes avant de lancer une révision.", "Select a package with cards before starting a review."),
            ["ReviewCompleted"] = ("Révision terminée", "Review complete"),
            ["NoCardDue"] = ("Aucune question disponible dans les paquets sélectionnés.", "No questions available in the selected packages."),
            ["ReviewCardMissing"] = ("La carte sélectionnée n’existe plus dans le paquet actif.", "The selected card no longer exists in the active package."),
            ["ReviewPromptNotSaved"] = ("La sollicitation n’a pas pu être enregistrée.", "The prompt could not be saved."),
            ["ReviewWindowTitle"] = ("Révision", "Review"),
            ["RevealAnswerButton"] = ("Révéler la réponse", "Reveal answer"),
            ["QcmSingleAnswerHint"] = ("Une seule bonne réponse", "Select one answer"),
            ["QcmMultipleAnswersHint"] = ("Plusieurs bonnes réponses : cochez-les toutes", "Several correct answers: select all of them"),
            ["QcmCorrectSelected"] = ("✓ Bonne réponse", "✓ Correct"),
            ["QcmIncorrectSelected"] = ("✗ Mauvaise réponse", "✗ Incorrect"),
            ["QcmCorrectMissed"] = ("! Bonne réponse non cochée", "! Correct answer not selected"),
            ["QcmSelfAssessmentHint"] = ("Cette correction est indicative : seule votre autoévaluation ci-dessous est enregistrée.", "This check is a guide only: only your self-assessment below is recorded."),
            ["CloseWithoutResultHint"] = ("Fermer la bulle (✕) termine la sollicitation sans résultat.", "Closing the bubble (✕) ends the prompt without a result."),
            ["ReviewResultNotSaved"] = ("Le résultat n’a pas pu être enregistré.", "The result could not be saved."),
            ["PackagesHeading"] = ("Paquets de révision", "Revision packages"),
            ["PackageCardsHeading"] = ("Questions du paquet", "Package questions"),
            ["ManageQuestions"] = ("Gérer les cartes du paquet", "Manage package cards"),
            ["PackageCardsAction"] = ("Cartes", "Cards"),
            ["AddCard"] = ("Ajouter une carte", "Add card"),
            ["EditCard"] = ("Modifier la carte sélectionnée", "Edit selected card"),
            ["CreateCardTitle"] = ("Ajouter une carte au paquet", "Add a card to the package"),
            ["EditCardTitle"] = ("Modifier la carte", "Edit card"),
            ["CardExplanationLabel"] = ("Explication (facultative)", "Explanation (optional)"),
            ["CardLanguageLabel"] = ("Langue BCP 47 (facultative)", "BCP 47 language (optional)"),
            ["CardTagsLabel"] = ("Tags (facultatifs)", "Tags (optional)"),
            ["CardTagsHint"] = ("Un tag par ligne, 20 maximum.", "One tag per line, up to 20."),
            ["CardEditorLanguageInvalid"] = ("Saisissez une balise de langue BCP 47 valide.", "Enter a valid BCP 47 language tag."),
            ["CardEditorTagsInvalid"] = ("Chaque tag doit contenir de 1 à 64 caractères ; 20 tags maximum sont autorisés.", "Each tag must contain 1 to 64 characters; at most 20 tags are allowed."),
            ["CardEditorInvalid"] = ("Vérifiez les champs de la carte.", "Check the card fields."),
            ["CardTypeLabel"] = ("Type de question", "Question type"),
            ["CardTypeCard"] = ("Card : question / réponse libre", "Card: question / free answer"),
            ["CardTypeQcm"] = ("QCM : choix de réponses", "QCM: multiple choice"),
            ["CardChoicesLabel"] = ("Choix de réponse", "Answer choices"),
            ["CardChoicesHint"] = ("Un choix par ligne, de 2 à 10. Préfixez chaque bonne réponse par [x] : une seule bonne réponse affiche des boutons radio, plusieurs affichent des cases à cocher.", "One choice per line, 2 to 10. Prefix each correct answer with [x]: one correct answer shows radio buttons, several show checkboxes."),
            ["CardImageLabel"] = ("Image de la question (facultative)", "Question image (optional)"),
            ["CardImageHint"] = ("PNG ou JPEG, 4 Mio maximum. Une image peut remplacer le texte de la question.", "PNG or JPEG, up to 4 MiB. An image can replace the question text."),
            ["AnswerImageLabel"] = ("Image de la réponse (facultative)", "Answer image (optional)"),
            ["AnswerImageHint"] = ("PNG ou JPEG, 4 Mio maximum. L’image s’affiche avec la réponse après sa révélation.", "PNG or JPEG, up to 4 MiB. The image is shown with the answer after it is revealed."),
            ["CardImageChoose"] = ("Choisir une image…", "Choose an image…"),
            ["CardImageRemove"] = ("Supprimer l’image", "Remove image"),
            ["CardImageInvalid"] = ("Choisissez une image PNG ou JPEG valide de 4 Mio maximum.", "Choose a valid PNG or JPEG image up to 4 MiB."),
            ["CardImageAttached"] = ("Image jointe", "Image attached"),
            ["QuestionImageCouldNotBeLoaded"] = ("L’image de la question n’a pas pu être affichée.", "The question image could not be displayed."),
            ["AnswerImageAttached"] = ("Image de réponse jointe", "Answer image attached"),
            ["AnswerImageCouldNotBeLoaded"] = ("L’image de la réponse n’a pas pu être affichée.", "The answer image could not be displayed."),
            ["OpenImageLarger"] = ("Ouvrir l’image en plus grand", "Open image larger"),
            ["ImagePreviewTitle"] = ("Agrandissement de l’image", "Image preview"),
            ["CloseImagePreview"] = ("Fermer l’aperçu de l’image", "Close image preview"),
            ["CardQcmAnswerHint"] = ("Pour un QCM, la réponse est facultative : laissée vide, elle reprend les bonnes réponses.", "For a QCM the answer is optional: when left empty, it repeats the correct choices."),
            ["CardEditorChoicesInvalid"] = ("Saisissez de 2 à 10 choix distincts (500 caractères maximum chacun) et marquez au moins une bonne réponse avec [x].", "Enter 2 to 10 distinct choices (up to 500 characters each) and mark at least one correct answer with [x]."),
            ["QcmTypePrefix"] = ("QCM · choix : ", "QCM · choices: "),
            ["CardEditorInvalidTitle"] = ("Carte invalide", "Invalid card"),
            ["CardLimitReached"] = ("Ce paquet a atteint sa limite de cartes.", "This package has reached its card limit."),
            ["CardMissing"] = ("Cette carte n’existe plus dans le stockage local.", "This card no longer exists in local storage."),
            ["CardNotSaved"] = ("La carte n’a pas pu être enregistrée. Le contenu précédent est conservé.", "The card could not be saved. Its previous content has been retained."),
            ["ActivePackageBadge"] = ("Actif pour les révisions", "Active for reviews"),
            ["ActivePackageStatus"] = ("Paquet actif pour les révisions : {0}", "Active review package: {0}"),
            ["ReviewPackagesStatus"] = ("Paquets sélectionnés pour les révisions : {0}", "Packages selected for review: {0}"),
            ["NoActivePackageStatus"] = ("Aucun paquet sélectionné pour les révisions.", "No package selected for review."),
            ["ReviewPackageSelectionHelp"] = ("Utilisez + ou ✓ pour inclure ou retirer un paquet des révisions. Cliquez sur un tag pour retirer le paquet de la sélection.", "Use + or ✓ to include or remove a package from reviews. Click a tag to remove the package from the selection."),
            ["ReviewPackageSelected"] = ("Inclus dans les révisions", "Included in reviews"),
            ["AddPackageToReviews"] = ("Inclure ce paquet dans les révisions", "Include this package in reviews"),
            ["RemovePackageFromReviews"] = ("Retirer ce paquet des révisions", "Remove this package from reviews"),
            ["ReviewPackageOrigin"] = ("Paquet : {0}", "Package: {0}"),
            ["SetActivePackage"] = ("Apprendre avec ce paquet", "Learn with this package"),
            ["NoPackagesAvailable"] = ("Aucun paquet enregistré. Téléchargez un paquet depuis la Bibliothèque ou importez un fichier JSON pour commencer.", "No packages yet. Download a package from the Library or import a JSON file to get started."),
            ["SelectPackageToViewCards"] = ("Sélectionnez un paquet pour consulter ses questions.", "Select a package to view its questions."),
            ["PackageHasNoCards"] = ("Ce paquet ne contient aucune question.", "This package has no questions."),
            ["PackageCardsNotLoaded"] = ("Les questions de ce paquet n’ont pas pu être chargées.", "The questions in this package could not be loaded."),
            ["CardMissing"] = ("Cette carte n’existe plus dans ce paquet.", "This card no longer exists in this package."),
            ["CardNotDeleted"] = ("La carte, sa progression et son historique n’ont pas été supprimés.", "The card, its progress, and its history could not be deleted."),
            ["ImportDescription"] = ("Importez un paquet de questions au format JSON Certif Buddy v1.", "Import a question package in Certif Buddy v1 JSON format."),
            ["ImportPackage"] = ("Importer un paquet JSON", "Import JSON package"),
            ["DownloadTemplate"] = ("Télécharger un modèle JSON", "Download JSON template"),
            ["ExportPackage"] = ("Exporter le paquet JSON", "Export JSON package"),
            ["PackageExportSaveTitle"] = ("Exporter un paquet JSON", "Export a JSON package"),
            ["PackageExportSavedTitle"] = ("Paquet exporté", "Package exported"),
            ["PackageExportSavedMessage"] = ("Le paquet JSON a été enregistré dans :{0}{1}", "The JSON package was saved to:{0}{1}"),
            ["PackageExportFailedTitle"] = ("Export impossible", "Export failed"),
            ["PackageExportFailedMessage"] = ("Le paquet n’a pas pu être exporté : {0}", "The package could not be exported: {0}"),
            ["PackageNotExported"] = ("Le paquet n’a pas été exporté.", "The package could not be exported."),
            ["SavedPackages"] = ("Paquets enregistrés", "Saved packages"),
            ["PackageLastModified"] = ("Dernière modification : {0}", "Last modified: {0}"),
            ["SearchPackages"] = ("Rechercher un paquet", "Search packages"),
            ["SearchCards"] = ("Rechercher dans les cartes", "Search cards"),
            ["CardReviewLevelLabel"] = ("Niveau actuel", "Current level"),
            ["CardEditorLevelInvalid"] = ("Saisissez un niveau entier positif ou nul.", "Enter a whole number greater than or equal to zero."),
            ["CardReviewLevelPrefix"] = ("Niveau : ", "Level: "),
            ["CardReviewLevel5Plus"] = ("5 et plus", "5 and above"),
            ["CardReviewLevelHint"] = ("Modifier le niveau ne change ni la date de prochaine révision ni l’historique.", "Changing the level preserves the next review date and history."),
            ["AllCardLevels"] = ("Tous les niveaux", "All levels"),
            ["FilterCardsByLevel"] = ("Filtrer les cartes par niveau", "Filter cards by level"),
            ["NoCardsMatchSearch"] = ("Aucune carte ne correspond à cette recherche.", "No cards match this search."),
            ["ShowSelectedPackagesOnly"] = ("Paquets sélectionnés", "Selected packages"),
            ["ShowAllPackages"] = ("Tous les paquets", "All packages"),
            ["NoReviewPackagesSelected"] = ("Aucun paquet n’est sélectionné pour les révisions.", "No packages are selected for review."),
            ["NoPackagesMatchSearch"] = ("Aucun paquet ne correspond à cette recherche.", "No packages match this search."),
            ["PackageCardCount"] = ("{0} carte", "{0} card"),
            ["PackageCardCountPlural"] = ("{0} cartes", "{0} cards"),
            ["PackageNameTooltip"] = ("Nom du paquet (1 à 100 caractères)", "Package name (1 to 100 characters)"),
            ["Rename"] = ("Renommer", "Rename"),
            ["Delete"] = ("Supprimer", "Delete"),
            ["InvalidReviewSettingsMessage"] = ("Saisissez un nombre entier positif de questions, une pause entière d’au moins 1 minute et un délai de rappel entier de 1 à 120 minutes.", "Enter a positive whole number of questions, a whole-minute pause of at least 1 minute and a whole-minute reminder delay from 1 to 120 minutes."),
            ["InvalidIntervalTitle"] = ("Réglages de série invalides", "Invalid series settings"),
            ["SelectImportFileTitle"] = ("Sélectionner un paquet JSON Certif Buddy", "Select a Certif Buddy JSON package"),
            ["ImportFileFilter"] = ("Paquet JSON Certif Buddy (*.json)|*.json", "Certif Buddy JSON package (*.json)|*.json"),
            ["ImportFailedTitle"] = ("Import impossible", "Import failed"),
            ["ImportCompletedTitle"] = ("Import terminé", "Import complete"),
            ["ImportCompletedMessage"] = ("Le paquet « {0} » et ses {1} cartes ont été importés.", "Package “{0}” and its {1} cards were imported."),
            ["PackageSaveFailed"] = ("Le paquet n’a pas été enregistré.", "The package could not be saved."),
            ["StorageErrorTitle"] = ("Erreur de stockage", "Storage error"),
            ["PackageSelectionNotSaved"] = ("La sélection du paquet n’a pas été enregistrée.", "The package selection could not be saved."),
            ["PackageMissing"] = ("Ce paquet n’existe plus dans le stockage local.", "This package no longer exists in local storage."),
            ["RenameFailed"] = ("Renommage impossible", "Rename failed"),
            ["PackageNameInvalid"] = ("Nom de paquet invalide", "Invalid package name"),
            ["PackageNameValidation"] = ("Le nom du paquet doit contenir entre 1 et 100 caractères.", "The package name must contain 1 to 100 characters."),
            ["ConfirmDeleteMessage"] = ("Supprimer le paquet « {0} » et toutes ses cartes, étiquettes et données de révision ? Cette action est définitive.", "Delete package “{0}” and all its cards, tags, and review data? This cannot be undone."),
            ["ConfirmDeleteCardMessage"] = ("Supprimer la carte « {0} », sa progression et tout son historique de révision ? Cette action est définitive.", "Delete card “{0}”, its progress, and all its review history? This cannot be undone."),
            ["ConfirmDeleteTitle"] = ("Confirmer la suppression", "Confirm deletion"),
            ["DeleteFailed"] = ("Suppression impossible", "Delete failed"),
            ["TemplateSaveTitle"] = ("Enregistrer un modèle de paquet JSON", "Save a JSON package template"),
            ["TemplateFileName"] = ("certif-buddy-package-v1.json", "certif-buddy-package-v1.json"),
            ["TemplateSavedMessage"] = ("Le modèle JSON a été enregistré dans :{0}{1}{0}{0}Remplacez les exemples en conservant les noms de champs et la structure.", "The JSON template was saved to:{0}{1}{0}{0}Replace the examples while keeping the field names and structure."),
            ["TemplateSavedTitle"] = ("Modèle enregistré", "Template saved"),
            ["TemplateSaveFailed"] = ("Le modèle n’a pas pu être enregistré : {0}", "The template could not be saved: {0}"),
            ["SaveErrorTitle"] = ("Erreur d’enregistrement", "Save error"),
            ["NoActivePackage"] = ("Aucun paquet non vide n’est sélectionné. Sélectionnez ou importez un paquet contenant au moins une carte, puis réessayez.", "No non-empty package is selected. Select or import a package with at least one card, then try again."),
            ["ActivationFailed"] = ("Activation impossible", "Cannot start assistant"),
            ["AssistantSettingsFailure"] = ("Le réglage de l’assistant n’a pas été enregistré.", "The assistant setting could not be saved."),
            ["StorageDiagnostic"] = ("Détail technique : {0}", "Technical details: {0}"),
            ["StorageDatabaseLocation"] = ("Fichier de données : {0}", "Data file: {0}"),
            ["StorageErrorInaccessible"] = ("La base locale est inaccessible : le fichier est peut-être verrouillé par un autre programme, déplacé, ou vos droits d’accès sont insuffisants. Aucune donnée n’a été modifiée par cette opération.", "The local database cannot be accessed: the file may be locked by another program, moved, or your access rights may be insufficient. No data was changed by this operation."),
            ["StorageErrorWriteFailed"] = ("L’écriture dans la base locale a échoué (disque plein, fichier en lecture seule ou erreur du disque). Rien n’a été enregistré par cette opération.", "Writing to the local database failed (disk full, read-only file, or disk error). Nothing was saved by this operation."),
            ["StorageErrorCorrupted"] = ("La base locale semble endommagée ou n’est pas une base Certif Buddy valide. Elle n’a été ni modifiée, ni remplacée par une base vide ; conservez une copie du fichier avant toute intervention.", "The local database appears to be damaged or is not a valid Certif Buddy database. It was neither changed nor replaced with an empty database; keep a copy of the file before taking any action."),
            ["StorageErrorIncompatibleVersion"] = ("La base locale provient d’une version plus récente de Certif Buddy. Elle n’a pas été modifiée ; utilisez une version compatible de l’application.", "The local database comes from a newer version of Certif Buddy. It was not changed; use a compatible version of the application."),
            ["StorageErrorOperationFailed"] = ("L’opération sur la base locale a échoué. Aucune donnée n’a été modifiée par cette opération.", "The local database operation failed. No data was changed by this operation."),
            ["LocalDataHeading"] = ("Données locales", "Local data"),
            ["LocalDataNotice"] = ("Vos paquets, préférences et révisions sont stockés uniquement sur cet appareil, sans compte ni connexion réseau. La base locale n’est pas chiffrée et n’est ni sauvegardée ni synchronisée : elle est protégée seulement par les droits de votre session Windows, pas contre un administrateur du poste.", "Your packages, preferences, and reviews are stored only on this device, with no account or network connection. The local database is not encrypted, backed up, or synchronized: it is protected only by your Windows account permissions, not against an administrator of this computer."),
            ["UnexpectedErrorMessage"] = ("Une erreur inattendue est survenue ; Certif Buddy va se fermer. L’opération en cours n’a peut-être pas été enregistrée.", "An unexpected error occurred; Certif Buddy will close. The current operation may not have been saved."),
            ["ApplicationTitle"] = ("Certif Buddy", "Certif Buddy"),
            ["PreferencesFailure"] = ("Les préférences n’ont pas pu être enregistrées ou chargées.", "Preferences could not be saved or loaded."),
            ["PackageListNotLoaded"] = ("La liste des paquets n’a pas pu être chargée.", "The package list could not be loaded."),
            ["PackageNotRenamed"] = ("Le paquet n’a pas été renommé.", "The package could not be renamed."),
            ["PackageNotDeleted"] = ("Le paquet n’a pas été supprimé.", "The package could not be deleted."),
            ["PreviewTitle"] = ("Aperçu de l’import", "Import preview"),
            ["PackageName"] = ("Nom du paquet", "Package name"),
            ["CardCountInSourceSingular"] = ("{0} carte dans le fichier source.", "{0} card in the source file."),
            ["CardCountInSourcePlural"] = ("{0} cartes dans le fichier source.", "{0} cards in the source file."),
            ["PreviewCards"] = ("Cartes de l’aperçu", "Preview cards"),
            ["Question"] = ("Question", "Question"),
            ["Answer"] = ("Réponse", "Answer"),
            ["QuestionCard"] = ("Question de la carte", "Card question"),
            ["AnswerCard"] = ("Réponse de la carte", "Card answer"),
            ["ExplanationPrefix"] = ("Explication : ", "Explanation: "),
            ["LanguagePrefix"] = ("Langue : ", "Language: "),
            ["TagsPrefix"] = ("  |  Tags : ", "  |  Tags: "),
            ["ExcludeCard"] = ("Exclure explicitement cette carte de l’import", "Explicitly exclude this card from the import"),
            ["Cancel"] = ("Annuler", "Cancel"),
            ["CreatePackage"] = ("Créer le paquet", "Create package"),
            ["CardLabel"] = ("Carte {0}", "Card {0}"),
            ["CardExcluded"] = ("Exclue", "Excluded"),
            ["CardInvalid"] = ("Invalide — corrigez la question et la réponse ou excluez cette carte.", "Invalid — correct the question and answer, or exclude this card."),
            ["CardCorrected"] = ("Corrigée", "Corrected"),
            ["CardValid"] = ("Valide", "Valid"),
            ["RevealAnswer"] = ("Afficher la réponse", "Reveal answer"),
            ["HideAnswer"] = ("Masquer la réponse", "Hide answer"),
            ["ReviewAgain"] = ("À revoir", "Again"),
            ["ReviewLevelChange"] = ("Niv. {0} → {1}", "Lvl. {0} → {1}"),
            ["ReviewHard"] = ("Difficile", "Hard"),
            ["ReviewGood"] = ("Correct", "Good"),
            ["ReviewEasy"] = ("Facile", "Easy"),
            ["ReviewDelayMinutes"] = ("≥ {0} min", "≥ {0} min"),
            ["ReviewDelayHours"] = ("≥ {0} h", "≥ {0} hr"),
            ["ReviewDelayDay"] = ("≥ {0} jour", "≥ {0} day"),
            ["ReviewDelayDays"] = ("≥ {0} jours", "≥ {0} days"),
            ["PassCard"] = ("Passer", "Pass"),
            ["Close"] = ("Fermer", "Close"),
            ["NextCard"] = ("Question suivante", "Next question"),
            ["StatisticsHeading"] = ("Statistiques", "Statistics"),
            ["StatisticsSubtitle"] = ("Suivez votre activité de révision et la progression de vos cartes.", "Track your review activity and how your cards progress."),
            ["GlobalSummary"] = ("Résumé global", "Overall summary"),
            ["PackageStatistics"] = ("Statistiques du paquet", "Package statistics"),
            ["PromptsShown"] = ("Sollicitations présentées", "Prompts shown"),
            ["ReviewsCompleted"] = ("Révisions terminées", "Reviews completed"),
            ["CardsDue"] = ("Cartes à revoir", "Cards due"),
            ["NextDueDate"] = ("Prochaine échéance", "Next due"),
            ["ReviewAgainCount"] = ("À revoir", "Again"),
            ["ReviewHardCount"] = ("Difficile", "Hard"),
            ["ReviewGoodCount"] = ("Correct", "Good"),
            ["ReviewEasyCount"] = ("Facile", "Easy"),
            ["ReviewPassedCount"] = ("Passées", "Passed"),
            ["ReviewNoResultCount"] = ("Sans résultat", "No result"),
            ["AverageReviewLevel"] = ("Niveau moyen", "Average level"),
            ["SelfAssessmentDisclaimer"] = ("Ces chiffres reflètent vos autoévaluations et ne prédisent pas votre réussite à un examen.", "These figures reflect your self-assessments and do not predict exam success."),
            ["NoPackageSelectedForStatistics"] = ("Sélectionnez un paquet pour afficher ses statistiques.", "Select a package to view its statistics."),
            ["NoUpcomingDeadline"] = ("Aucune échéance future", "No upcoming deadline"),
            ["StatisticsNotLoaded"] = ("Les statistiques n’ont pas pu être chargées.", "Statistics could not be loaded."),
            ["StatisticsFiltersHeading"] = ("Périmètre et période", "Scope and period"),
            ["StatisticsScopeLabel"] = ("Paquet consulté", "Package to view"),
            ["StatisticsGlobalScope"] = ("Tous les paquets", "All packages"),
            ["StatisticsPackageScope"] = ("Statistiques du paquet « {0} »", "Statistics for package “{0}”"),
            ["StatisticsActivityHeading"] = ("Révisions sur les 52 dernières semaines", "Activity over the last 52 weeks"),
            ["StatisticsActivityDayTooltip"] = ("{0} : {1} révisions", "{0}: {1} reviews"),
            ["StatisticsActivityError"] = ("L’activité n’a pas pu être chargée.", "Activity could not be loaded."),
            ["StatisticsActivityLess"] = ("Moins", "Less"),
            ["StatisticsActivityMore"] = ("Plus", "More"),
            ["StatisticsCurrentSummaryHeading"] = ("Indicateurs actuels — toutes périodes", "Current indicators — all time"),
            ["StatisticsCurrentSummaryScope"] = ("Périmètre : {0}", "Scope: {0}"),
            ["StatisticsCurrentSummaryDescription"] = ("Ces indicateurs couvrent toutes les dates ; la période sélectionnée filtre les graphiques de présentations et d’autoévaluations.", "These indicators cover all dates; the selected period filters the presentation and self-assessment charts."),
            ["StatisticsSummaryNoEvents"] = ("Aucune présentation enregistrée pour ce périmètre ; l’historique de présentation est vide. Les indicateurs de répétition reflètent les cartes disponibles.", "No presentations are recorded for this scope; the presentation history is empty. Repetition indicators reflect the available cards."),
            ["StatisticsCardDistributionHeading"] = ("État des cartes", "Card status"),
            ["StatisticsCardDistributionDescription"] = ("Répartition par niveau actuel, avec les niveaux 5 et plus regroupés. Les cartes jamais affichées et encore au niveau 0 sont comptées séparément comme non vues.", "Distribution by current level, with levels 5 and above grouped together. Cards never displayed and still at level 0 are counted separately as unseen."),
            ["StatisticsCardLevel"] = ("Niveau {0}", "Level {0}"),
            ["StatisticsLevelTimelineHeading"] = ("Évolution cumulée des cartes par niveau", "Stacked card levels over time"),
            ["StatisticsLevelTimelineDescription"] = ("Effectifs en fin de période, empilés des cartes non vues (en bas) aux niveaux 5 et plus (en haut). Historique reconstitué pour les cartes encore présentes ; les changements manuels ne sont pas datés et le dernier point incluant aujourd’hui utilise les niveaux actuels.", "End-of-period counts, stacked from unseen cards (bottom) through levels 5 and above (top). Reconstructed for surviving cards; manual changes are not dated, and the last point including today uses current levels."),
            ["StatisticsCardDistributionNoCards"] = ("Aucune carte dans ce périmètre.", "There are no cards in this scope."),
            ["StatisticsUnseenCards"] = ("Non vues", "Unseen"),
            ["StatisticsDueCards"] = ("À réviser", "Due for review"),
            ["StatisticsLearnedCards"] = ("Apprises", "Learned"),
            ["StatisticsCardCountAccessibleValue"] = ("{0} : {1} cartes", "{0}: {1} cards"),
            ["StatisticsStartDate"] = ("Date de début", "Start date"),
            ["StatisticsEndDate"] = ("Date de fin", "End date"),
            ["StatisticsApplyFilters"] = ("Appliquer les filtres", "Apply filters"),
            ["StatisticsDateRangeInvalid"] = ("La date de début doit être antérieure ou égale à la date de fin.", "The start date must be on or before the end date."),
            ["StatisticsTimelineHeading"] = ("Questions présentées dans le temps", "Questions presented over time"),
            ["StatisticsTimelineXAxis"] = ("Questions présentées", "Questions presented"),
            ["StatisticsTimelineYAxis"] = ("Période", "Period"),
            ["StatisticsGranularityDaily"] = ("Par jour", "By day"),
            ["StatisticsGranularityWeekly"] = ("Par semaine", "By week"),
            ["StatisticsGranularityMonthly"] = ("Par mois", "By month"),
            ["StatisticsPeriodLabel"] = ("Période", "Period"),
            ["StatisticsPresentationsLabel"] = ("Présentations", "Presentations"),
            ["StatisticsNoTimelineData"] = ("Aucun événement de révision sur cette période. Les filtres restent disponibles.", "No review events in this period. The filters remain available."),
            ["StatisticsOutcomeHeading"] = ("Répartition des autoévaluations", "Self-assessment distribution"),
            ["StatisticsOutcomeDescription"] = ("Les passages et les événements sans résultat ne sont pas inclus.", "Passes and no-result events are not included."),
            ["StatisticsNoOutcomes"] = ("Aucune autoévaluation sur cette période.", "No self-assessments in this period."),
            ["StatisticsOutcomeAccessibleValue"] = ("{0} : {1} autoévaluations", "{0}: {1} self-assessments"),
            ["NoStatistics"] = ("Aucune statistique disponible.", "No statistics available."),
            ["QuestionRequired"] = ("la question doit contenir du texte ou une image.", "the question must contain text or an image."),
            ["AnswerRequired"] = ("la réponse ne peut pas être vide ou blanche.", "the answer cannot be empty or whitespace."),
            ["ImportSummary"] = ("{0} acceptée{1} ({2} valide{3}, {4} corrigée{5}), {6} exclue{7}, {8} invalide{9} sur {10} carte{11}.", "{0} accepted ({2} valid, {4} corrected), {6} excluded, {8} invalid out of {10} cards."),
            ["NoImportConfirmed"] = ("Aucun import n’a été confirmé.", "No import has been confirmed."),
            ["FixOrExcludeCards"] = ("Corrigez ou excluez les cartes invalides et conservez au moins une carte avant de confirmer.", "Correct or exclude invalid cards and keep at least one card before confirming."),
            ["CompanionName"] = ("Personnage pixel art de Certif Buddy", "Certif Buddy pixel-art character"),
            ["CompanionDragHint"] = ("Glissez-déposez le compagnon pour le déplacer.", "Drag and drop the companion to move it."),
            ["AvatarLoadFailure"] = ("L’avatar du compagnon n’a pas pu être chargé depuis les fichiers de l’application. Les révisions restent disponibles.", "The companion avatar could not be loaded from the application files. Reviews remain available."),
            ["CloseBubble"] = ("Fermer sans résultat", "Close without a result"),
            ["ParserFileTooLarge"] = ("Le fichier dépasse la limite de {0} Mio.", "The file exceeds the {0} MiB limit."),
            ["ParserInvalidUtf8"] = ("Le fichier n’est pas encodé en UTF-8 valide.", "The file is not valid UTF-8."),
            ["ParserMalformedJson"] = ("Le JSON est mal formé à la ligne {0}, colonne {1}.", "Malformed JSON at line {0}, column {1}."),
            ["ParserFileUnreadable"] = ("Le fichier « {0} » n’a pas pu être lu.", "File “{0}” could not be read."),
            ["ParserRootObject"] = ("la racine JSON doit être un objet", "the JSON root must be an object"),
            ["ParserExpectedFormat"] = ("la valeur attendue est « certif-buddy »", "the expected value is “certif-buddy”"),
            ["ParserRequiredField"] = ("champ obligatoire absent", "required field is missing"),
            ["ParserExpectedInteger"] = ("un entier est attendu", "an integer is required"),
            ["ParserExpectedString"] = ("une chaîne est attendue", "a string is required"),
            ["ParserVersionUnsupported"] = ("la version {0} n’est pas prise en charge", "version {0} is not supported"),
            ["ParserTitleLength"] = ("le titre doit contenir entre 1 et 100 caractères après trim", "the title must contain 1 to 100 characters after trimming"),
            ["ParserExpectedArray"] = ("un tableau est attendu", "an array is required"),
            ["ParserCardCount"] = ("le paquet doit contenir entre 1 et {0} cartes", "the package must contain 1 to {0} cards"),
            ["ParserCardObject"] = ("une carte doit être un objet", "a card must be an object"),
            ["ParserExpectedStringOrNull"] = ("une chaîne ou null est attendu", "a string or null is required"),
            ["ParserExpectedLanguageTag"] = ("une balise de langue BCP 47 est attendue", "a BCP 47 language tag is required"),
            ["ParserInvalidLanguageTag"] = ("la balise de langue BCP 47 est invalide", "the BCP 47 language tag is invalid"),
            ["ParserExpectedStringArray"] = ("un tableau de chaînes est attendu", "an array of strings is required"),
            ["ParserMaxTags"] = ("au plus {0} tags sont autorisés", "at most {0} tags are allowed"),
            ["ParserTagString"] = ("un tag doit être une chaîne", "a tag must be a string"),
            ["ParserTagLength"] = ("un tag doit contenir entre 1 et 64 caractères après trim", "a tag must contain 1 to 64 characters after trimming"),
            ["ParserUnknownProperty"] = ("propriété inconnue", "unknown property"),
            ["ParserDuplicateProperty"] = ("propriété JSON dupliquée", "duplicate JSON property"),
            ["ParserCardType"] = ("le type doit être « Card » ou « QCM »", "the type must be “Card” or “QCM”"),
            ["ParserChoicesOnlyForQcm"] = ("les choix ne sont autorisés que pour le type « QCM »", "choices are only allowed for the “QCM” type"),
            ["ParserChoiceCount"] = ("un QCM doit proposer entre {0} et {1} choix", "a QCM must offer {0} to {1} choices"),
            ["ParserChoiceLength"] = ("un choix doit contenir entre 1 et {0} caractères après trim", "a choice must contain 1 to {0} characters after trimming"),
            ["ParserChoiceDuplicate"] = ("deux choix ont le même texte", "two choices have the same text"),
            ["ParserChoiceNoCorrect"] = ("au moins un choix doit être correct", "at least one choice must be correct"),
            ["ParserChoiceObject"] = ("un choix doit être un objet", "a choice must be an object"),
            ["ParserExpectedBoolean"] = ("un booléen est attendu", "a boolean is required"),
            ["ParserImageFormat"] = ("l’image doit être au format PNG ou JPEG", "the image must be in PNG or JPEG format"),
            ["ParserImageSize"] = ("l’image doit contenir entre 1 octet et 4 Mio", "the image must contain between 1 byte and 4 MiB"),
            ["StartupInstanceUnresponsive"] = ("L’instance déjà ouverte n’a pas répondu. Réessayez dans quelques instants.", "The existing instance did not respond. Try again in a few moments."),
            ["StartupFailure"] = ("Certif Buddy n’a pas pu démarrer.", "Certif Buddy could not start."),
            ["ActivationServiceFailure"] = ("Le service d’activation de Certif Buddy a échoué.", "The Certif Buddy activation service failed.")
        };

    /// <summary>Texts that replace the default wording only while a given avatar preset is applied.</summary>
    private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, (string French, string English)>> AvatarTexts =
        new Dictionary<string, IReadOnlyDictionary<string, (string French, string English)>>(StringComparer.Ordinal)
        {
            [AvatarStoryboard.SunPresetId] = new Dictionary<string, (string French, string English)>(StringComparer.Ordinal)
            {
                ["ReviewAgain"] = ("Wooo", "Wooo"),
                ["ReviewHard"] = ("Whooo-Wheee", "Whooo-Wheee"),
                ["ReviewGood"] = ("Wheee-Whooo", "Wheee-Whooo"),
                ["ReviewEasy"] = ("Wheee", "Wheee"),
                ["PauseAssistant"] = ("Perfectionner l’art de la sieste", "Perfect the art of napping"),
                ["ResumeAssistant"] = ("Réveiller Esquie", "Wake Esquie")
            }
        };

    public static IReadOnlyCollection<string> Keys => Texts.Keys.ToArray();

    /// <summary>Gets a UI text, using the wording specific to <paramref name="avatarPresetId"/> when one exists.</summary>
    public static string Get(string key, string language, string? avatarPresetId)
    {
        var text = Get(key, language);
        if (avatarPresetId is null
            || !AvatarTexts.TryGetValue(avatarPresetId, out var overrides)
            || !overrides.TryGetValue(key, out var avatarText))
        {
            return text;
        }

        return language == "en" ? avatarText.English : avatarText.French;
    }

    public static string Get(string key, string language = "fr")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        if (!Texts.TryGetValue(key, out var text))
        {
            throw new KeyNotFoundException($"Unknown UI text: {key}.");
        }

        return language switch
        {
            "fr" => text.French,
            "en" => text.English,
            _ => throw new ArgumentOutOfRangeException(nameof(language), language, null)
        };
    }

    public static string Format(string key, string language, params object?[] arguments) =>
        string.Format(
            language == "en"
                ? System.Globalization.CultureInfo.GetCultureInfo("en-US")
                : System.Globalization.CultureInfo.GetCultureInfo("fr-FR"),
            Get(key, language),
            arguments);

    public static string TranslateImportDetail(string detail, string language)
    {
        ValidateLanguage(language);
        if (language == "fr")
        {
            return detail;
        }

        var dynamicMatch = System.Text.RegularExpressions.Regex.Match(
            detail,
            @"^(?:la version )(?<version>-?\d+)(?: n’est pas prise en charge)$");
        if (dynamicMatch.Success)
        {
            return Format("ParserVersionUnsupported", language, dynamicMatch.Groups["version"].Value);
        }

        dynamicMatch = System.Text.RegularExpressions.Regex.Match(
            detail,
            @"^le paquet doit contenir entre 1 et (?<count>\d+) cartes$");
        if (dynamicMatch.Success)
        {
            return Format("ParserCardCount", language, dynamicMatch.Groups["count"].Value);
        }

        dynamicMatch = System.Text.RegularExpressions.Regex.Match(
            detail,
            @"^au plus (?<count>\d+) tags sont autorisés$");
        if (dynamicMatch.Success)
        {
            return Format("ParserMaxTags", language, dynamicMatch.Groups["count"].Value);
        }

        if (detail == Format("ParserChoiceCount", "fr", CardChoices.MinimumChoices, CardChoices.MaximumChoices))
        {
            return Format("ParserChoiceCount", language, CardChoices.MinimumChoices, CardChoices.MaximumChoices);
        }

        if (detail == Format("ParserChoiceLength", "fr", CardChoices.MaximumChoiceLength))
        {
            return Format("ParserChoiceLength", language, CardChoices.MaximumChoiceLength);
        }

        var keys = new[]
        {
            "ParserRootObject", "ParserExpectedFormat", "ParserRequiredField",
            "ParserExpectedInteger", "ParserExpectedString", "ParserTitleLength", "ParserExpectedArray",
            "ParserCardObject", "ParserExpectedStringOrNull", "ParserExpectedLanguageTag",
            "ParserInvalidLanguageTag", "ParserExpectedStringArray", "ParserTagString",
            "ParserTagLength", "ParserUnknownProperty", "ParserDuplicateProperty",
            "ParserCardType", "ParserChoicesOnlyForQcm", "ParserChoiceDuplicate",
            "ParserChoiceNoCorrect", "ParserChoiceObject", "ParserExpectedBoolean",
            "ParserImageFormat", "ParserImageSize"
        };
        foreach (var key in keys)
        {
            if (Get(key) == detail)
            {
                return Get(key, language);
            }
        }

        return detail;
    }

    public static string TranslateImportError(string message, string language)
    {
        ValidateLanguage(language);
        if (language == "fr")
        {
            return message;
        }

        var malformedMatch = System.Text.RegularExpressions.Regex.Match(
            message,
            @"^Le JSON est mal formé à la ligne (?<line>\d+), colonne (?<column>\d+)\.$");
        if (malformedMatch.Success)
        {
            return Format(
                "ParserMalformedJson",
                language,
                malformedMatch.Groups["line"].Value,
                malformedMatch.Groups["column"].Value);
        }

        var sizeMatch = System.Text.RegularExpressions.Regex.Match(
            message,
            @"^Le fichier dépasse la limite de (?<size>\d+) Mio\.$");
        if (sizeMatch.Success)
        {
            return Format("ParserFileTooLarge", language, sizeMatch.Groups["size"].Value);
        }

        if (message == Get("ParserInvalidUtf8"))
        {
            return Get("ParserInvalidUtf8", language);
        }

        var unreadableMatch = System.Text.RegularExpressions.Regex.Match(
            message,
            "^Le fichier « (?<path>.*) » n’a pas pu être lu\\.$");
        if (unreadableMatch.Success)
        {
            return Format("ParserFileUnreadable", language, unreadableMatch.Groups["path"].Value);
        }

        var invalidMatch = System.Text.RegularExpressions.Regex.Match(
            message,
            @"^(?<path>\$.*?) : (?<detail>.*)\.$");
        if (invalidMatch.Success)
        {
            return $"{invalidMatch.Groups["path"].Value}: "
                + $"{TranslateImportDetail(invalidMatch.Groups["detail"].Value, language)}.";
        }

        return message;
    }

    private static void ValidateLanguage(string language)
    {
        if (language is not ("fr" or "en"))
        {
            throw new ArgumentOutOfRangeException(nameof(language));
        }
    }
}
